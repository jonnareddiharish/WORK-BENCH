import { Injectable, Inject, OnApplicationShutdown } from '@nestjs/common';
import neo4j, { Driver } from 'neo4j-driver';

@Injectable()
export class Neo4jService implements OnApplicationShutdown {
  private readonly driver: Driver;

  constructor(@Inject('NEO4J_CONFIG') private config: any) {
    if (!config.uri || config.uri.includes('<your_neo4j_instance_id>')) {
      console.warn('Neo4j URI is not defined properly, skipping connection.');
      return;
    }
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );
  }

  getDriver(): Driver {
    return this.driver;
  }

  async onApplicationShutdown() {
    if (this.driver) {
      await this.driver.close();
    }
  }
}
