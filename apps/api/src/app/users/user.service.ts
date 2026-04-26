import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';
import { HealthEvent, HealthEventDocument } from '../health-events/health-event.schema';
import { DietLog, DietLogDocument } from '../diet-logs/diet-log.schema';
import { Lifestyle, LifestyleDocument } from '../lifestyle/lifestyle.schema';
import { AIPatientContext, AIPatientContextDocument } from '../ai-context/ai-context.schema';
import { Neo4jService } from '../neo4j/neo4j.service';
import { AgentService } from '../agent/agent.service';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HealthEvent.name) private healthEventModel: Model<HealthEventDocument>,
    @InjectModel(DietLog.name) private dietLogModel: Model<DietLogDocument>,
    @InjectModel(Lifestyle.name) private lifestyleModel: Model<LifestyleDocument>,
    @InjectModel(AIPatientContext.name) private aiContextModel: Model<AIPatientContextDocument>,
    private neo4jService: Neo4jService,
    private agentService: AgentService
  ) {}

  async create(userData: any): Promise<User> {
    const createdUser = new this.userModel(userData);
    const savedUser = await createdUser.save();
    
    // Create initial AI context document
    const dobString = savedUser.dob instanceof Date && !isNaN(savedUser.dob.getTime()) 
      ? savedUser.dob.toISOString().split('T')[0] 
      : 'unknown date';

    const aiContext = new this.aiContextModel({
      userId: savedUser._id,
      promptContext: {
        demographics: `${savedUser.name} is a ${savedUser.biologicalSex || 'person'} born on ${dobString}.`
      }
    });
    await aiContext.save();

    // Embed user profile for semantic search
    const profileText = `Patient ${savedUser.name}: ` +
      `conditions [${(savedUser.medicalConditions || []).join(', ') || 'none'}], ` +
      `allergies [${(savedUser.knownAllergies || []).join(', ') || 'none'}], ` +
      `medications [${(savedUser.medications || []).join(', ') || 'none'}]`;
    this.agentService.embedAndStore(
      savedUser._id.toString(), savedUser._id.toString() + '_profile',
      'PROFILE', profileText, new Date().toISOString()
    );

    // Sync to Neo4j
    const driver = this.neo4jService.getDriver();
    if (!driver) {
      console.warn('Neo4j driver not initialized, skipping sync.');
      return savedUser;
    }

    const session = driver.session();
    try {
      const dobNeo = savedUser.dob instanceof Date && !isNaN(savedUser.dob.getTime())
        ? savedUser.dob.toISOString()
        : null;

      if (savedUser.familyId) {
        await session.run(
          `MERGE (f:Family {id: $familyId})
           CREATE (u:User {id: $id, name: $name, dob: $dob, biologicalSex: $sex})
           CREATE (u)-[:BELONGS_TO]->(f)`,
          {
            id: savedUser._id.toString(),
            name: savedUser.name,
            dob: dobNeo,
            sex: savedUser.biologicalSex || null,
            familyId: savedUser.familyId.toString()
          }
        );
      } else {
         await session.run(
          `CREATE (u:User {id: $id, name: $name, dob: $dob, biologicalSex: $sex})`,
          {
            id: savedUser._id.toString(),
            name: savedUser.name,
            dob: dobNeo,
            sex: savedUser.biologicalSex || null
          }
        );
      }
    } catch (error) {
      console.error('Error syncing user to Neo4j:', error);
    } finally {
      await session.close();
    }

    return savedUser;
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  async findOne(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    const updated = await this.userModel.findByIdAndUpdate(id, userData, { new: true }).exec();
    if (updated) {
      const profileText = `Patient ${updated.name}: ` +
        `conditions [${(updated.medicalConditions || []).join(', ') || 'none'}], ` +
        `allergies [${(updated.knownAllergies || []).join(', ') || 'none'}], ` +
        `medications [${(updated.medications || []).join(', ') || 'none'}]`;
      this.agentService.embedAndStore(
        id, id + '_profile', 'PROFILE', profileText, new Date().toISOString()
      );
    }
    return updated;
  }

  async delete(id: string): Promise<User | null> {
    // 1. Delete associated records from MongoDB
    await Promise.all([
      this.healthEventModel.deleteMany({ userId: id as any }),
      this.dietLogModel.deleteMany({ userId: id as any }),
      this.lifestyleModel.deleteMany({ userId: id as any }),
      this.aiContextModel.deleteMany({ userId: id as any })
    ]);

    // 2. Delete from MongoDB
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();

    // 3. Delete from Neo4j
    const driver = this.neo4jService.getDriver();
    if (driver) {
      const session = driver.session();
      try {
        await session.run(
          `MATCH (u:User {id: $id})
           DETACH DELETE u`,
          { id }
        );
      } catch (err) {
        console.error('Neo4j delete error:', err);
      } finally {
        await session.close();
      }
    }

    return deletedUser;
  }

  async addHealthEvent(userId: string, eventData: any): Promise<HealthEvent> {
    const event = new this.healthEventModel({ ...eventData, userId });
    const savedEvent = await event.save();

    // Sync to Neo4j for relationship mapping
    const driver = this.neo4jService.getDriver();
    if (driver) {
      const session = driver.session();
      try {
        await session.run(
          `MERGE (u:User {id: $userId})
           CREATE (e:HealthEvent {id: $eventId, title: $title, type: $type, date: $date})
           CREATE (u)-[:HAS_EVENT]->(e)`,
          {
            userId,
            eventId: savedEvent._id.toString(),
            title: (savedEvent.titles || []).join(', '),
            type: savedEvent.eventType,
            date: savedEvent.date.toISOString()
          }
        );
      } catch (err) {
        console.error('Neo4j sync error for health event:', err);
      } finally {
        await session.close();
      }
    }

    // Embed for semantic retrieval
    const eventText = `${savedEvent.eventType} on ${savedEvent.date.toISOString().slice(0, 10)}: ` +
      `${(savedEvent.titles || []).join(', ')} — ${(savedEvent as any).description || ''} (${savedEvent.status || ''})`;
    this.agentService.embedAndStore(
      userId, savedEvent._id.toString(), 'HEALTH_EVENT', eventText, savedEvent.date.toISOString()
    );

    return savedEvent;
  }

  async getHealthEvents(userId: string): Promise<HealthEvent[]> {
    return this.healthEventModel.find({ userId: userId as any }).sort({ date: -1 }).exec();
  }

  async addDietLog(userId: string, logData: any): Promise<DietLog> {
    const log = new this.dietLogModel({ ...logData, userId });
    const saved = await log.save();

    // Embed for semantic retrieval
    const foodText = (logData.foodItems || []).map((f: any) => `${f.name} ${f.quantity}`).join(', ');
    const dietText = `${(logData.mealTypes || []).join('/')} on ${saved.date.toISOString().slice(0, 10)}: ` +
      `${foodText || logData.description || 'meal logged'}`;
    this.agentService.embedAndStore(userId, saved._id.toString(), 'DIET_LOG', dietText, saved.date.toISOString());

    return saved;
  }

  async updateDietLog(logId: string, updateData: any): Promise<DietLog | null> {
    return this.dietLogModel.findByIdAndUpdate(logId, updateData, { new: true }).exec();
  }

  async deleteDietLog(logId: string): Promise<any> {
    const deleted = await this.dietLogModel.findByIdAndDelete(logId).exec();
    if (deleted) await this.agentService.deleteEmbedding(logId);
    return deleted;
  }

  async getDietLogs(userId: string): Promise<DietLog[]> {
    return this.dietLogModel.find({ userId: userId as any }).sort({ date: -1 }).exec();
  }

  // Lifestyle Methods
  async addLifestyle(userId: string, data: any): Promise<Lifestyle> {
    const entry = new this.lifestyleModel({ ...data, userId });
    const saved = await entry.save();

    // Embed for semantic retrieval
    const lsText = `Lifestyle on ${saved.date.toISOString().slice(0, 10)} ` +
      `[${(saved.categories || []).join('/')}]: ${saved.description}`;
    this.agentService.embedAndStore(userId, saved._id.toString(), 'LIFESTYLE', lsText, saved.date.toISOString());

    // Optional: Sync lifestyle to Neo4j if needed for future graph analysis
    const driver = this.neo4jService.getDriver();
    if (driver) {
      const session = driver.session();
      try {
        await session.run(
          `MERGE (u:User {id: $userId})
           CREATE (l:Lifestyle {id: $id, description: $desc, date: $date})
           CREATE (u)-[:HAS_LIFESTYLE_LOG]->(l)`,
          { userId, id: saved._id.toString(), desc: saved.description, date: saved.date.toISOString() }
        );
      } finally { await session.close(); }
    }
    return saved;
  }

  async getLifestyle(userId: string): Promise<Lifestyle[]> {
    return this.lifestyleModel.find({ userId: userId as any }).sort({ date: -1 }).exec();
  }

  async updateLifestyle(id: string, data: any): Promise<Lifestyle | null> {
    const updated = await this.lifestyleModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (updated) {
       const driver = this.neo4jService.getDriver();
       if (driver) {
         const session = driver.session();
         try {
           await session.run(
             `MATCH (l:Lifestyle {id: $id}) SET l.description = $desc, l.date = $date`,
             { id, desc: updated.description, date: updated.date.toISOString() }
           );
         } finally { await session.close(); }
       }
    }
    return updated;
  }

  async deleteLifestyle(id: string): Promise<any> {
    const deleted = await this.lifestyleModel.findByIdAndDelete(id).exec();
    if (deleted) await this.agentService.deleteEmbedding(id);
    const driver = this.neo4jService.getDriver();
    if (driver) {
      const session = driver.session();
      try {
        await session.run(`MATCH (l:Lifestyle {id: $id}) DETACH DELETE l`, { id });
      } finally { await session.close(); }
    }
    return deleted;
  }

  async updateHealthEvent(eventId: string, updateData: any): Promise<HealthEvent | null> {
    const updated = await this.healthEventModel.findByIdAndUpdate(eventId, updateData, { new: true }).exec();

    if (updated) {
      // Sync update to Neo4j
      const driver = this.neo4jService.getDriver();
      if (driver) {
        const session = driver.session();
        try {
          await session.run(
            `MATCH (e:HealthEvent {id: $eventId})
             SET e.title = $title, e.type = $type, e.date = $date`,
            {
              eventId,
              title: (updated.titles || []).join(', '),
              type: updated.eventType,
              date: updated.date.toISOString()
            }
          );
        } finally {
          await session.close();
        }
      }

      // Re-embed so semantic search reflects latest data
      const eventText =
        `${updated.eventType} on ${updated.date.toISOString().slice(0, 10)}: ` +
        `${(updated.titles || []).join(', ')} — ${(updated as any).description || ''} (${updated.status || ''})`;
      this.agentService.embedAndStore(
        (updated as any).userId?.toString() ?? '',
        eventId, 'HEALTH_EVENT', eventText, updated.date.toISOString()
      );
    }
    return updated;
  }

  async deleteHealthEvent(eventId: string): Promise<any> {
    const deleted = await this.healthEventModel.findByIdAndDelete(eventId).exec();

    if (deleted) {
      // Remove embedding from Neo4j vector index
      await this.agentService.deleteEmbedding(eventId);
      // Remove HealthEvent node from Neo4j
      const driver = this.neo4jService.getDriver();
      if (driver) {
        const session = driver.session();
        try {
          await session.run(`MATCH (e:HealthEvent {id: $eventId}) DETACH DELETE e`, { eventId });
        } finally {
          await session.close();
        }
      }
    }
    return deleted;
  }

  async getFamilyGraph() {
    // 1. Get all users from MongoDB to ensure everyone is represented as a node
    const mongoUsers = await this.findAll();
    
    const nodes = mongoUsers.map(u => ({
      id: (u as any)._id.toString(),
      label: u.name,
      type: 'User'
    }));

    const driver = this.neo4jService.getDriver();
    if (!driver) return { nodes, links: [] };

    const session = driver.session();
    try {
      // 2. Get all relationships from Neo4j
      const result = await session.run(
        `MATCH (n:User)-[r]->(m:User)
         RETURN n.id as source, m.id as target, type(r) as type`
      );

      const links = result.records.map(record => ({
        source: record.get('source'),
        target: record.get('target'),
        type: record.get('type')
      }));

      return {
        nodes,
        links
      };
    } finally {
      await session.close();
    }
  }

  async linkHealthEvents(sourceEventId: string, targetEventId: string, relationship: string) {
    const driver = this.neo4jService.getDriver();
    if (!driver) throw new Error('Neo4j driver not initialized');

    const session = driver.session();
    try {
      const relType = relationship.toUpperCase().replace(/\s+/g, '_');
      await session.run(
        `MATCH (a:HealthEvent {id: $sourceId}), (b:HealthEvent {id: $targetId})
         MERGE (a)-[r:${relType}]->(b)
         RETURN r`,
        { sourceId: sourceEventId, targetId: targetEventId }
      );
      return { success: true };
    } finally {
      await session.close();
    }
  }

  async linkUsers(sourceId: string, targetId: string, relationship: string) {
    const driver = this.neo4jService.getDriver();
    if (!driver) throw new Error('Neo4j driver not initialized');

    const session = driver.session();
    try {
      // relationship is the type, e.g., 'FATHER_OF'
      // We'll use the internal name for the relationship type in Neo4j
      const relType = relationship.toUpperCase().replace(/\s+/g, '_');
      
      await session.run(
        `MATCH (a:User {id: $sourceId}), (b:User {id: $targetId})
         MERGE (a)-[r:${relType}]->(b)
         RETURN r`,
        { sourceId, targetId }
      );
      return { success: true };
    } finally {
      await session.close();
    }
  }

  async generateInsights(userId: string) {
    const user = await this.findOne(userId);
    if (!user) throw new Error('User not found');
    const healthRecords = await this.getHealthEvents(userId);
    const dietLogs = await this.getDietLogs(userId);
    return this.agentService.generateHealthPlan(userId, user, healthRecords, dietLogs);
  }
}