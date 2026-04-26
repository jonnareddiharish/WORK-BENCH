# Workbench User Dashboard - Feature Documentation

## Overview
The Workbench User Dashboard is a comprehensive health and wellness management interface designed for individual users. It provides AI-powered health insights, meal planning, health record tracking, and interactive features to manage personal health data.

## Core Features

### 1. AI Health Suggestions & Chat
**Location**: Main dashboard card (left column, top)
**Purpose**: Provides AI-generated health insights and interactive chat with health agent

**Features**:
- **Expandable AI Card**: Click to expand into full-screen modal with detailed insights
- **Health Insights**: AI analyzes health events and provides observations
- **Dietary Guidance**: AI analyzes diet logs and provides recommendations
- **Interactive Chat**: Real-time conversation with AI health agent
  - Ask questions about medications, diet, health reports
  - Agent responds with personalized advice
  - Chat history maintained during session

**Technical Details**:
- Uses `BrainCircuit` icon for AI representation
- Framer Motion animations for smooth transitions
- Real-time message sending with loading states
- Backend integration with AI agent API

### 2. Recommended Meal Plan (Compact View)
**Location**: Main dashboard card (left column, below AI card)
**Purpose**: Quick overview of today's meal plan with navigation to full dashboard

**Features**:
- **Today's Meal Overview**: Shows up to 3 meals for the current day
- **Navigation**: Clicking card navigates to `/users/:id/meal-plan` (full meal plan dashboard)
- **Loading States**: Shows skeleton loader while generating/fetching
- **Empty State**: Prompts user to generate first meal plan
- **Day Indicator**: Shows date of first meal plan day

**Technical Details**:
- Uses `UtensilsCrossed` icon
- Responsive design with hover effects
- Integration with meal plan generation API
- Navigates using React Router

### 3. Health Records Management
**Location**: Right column, top card
**Purpose**: Track and manage health events and doctor reports

**Features**:
- **Dual View Tabs**: Switch between "My Logs" (user entries) and "Doctor Reports" (professional entries)
- **Record List**: Chronological display of health events
- **Quick Add**: Plus button to add new health records
- **Record Details**:
  - Date of event
  - Title/description
  - Status indicators (ACTIVE, RESOLVED)
  - Source tagging (USER or DOCTOR)
- **Navigation**: Click header to navigate to detailed health notes page

**Add Health Record Modal**:
- **Form Fields**: Title, Type (Doctor Visit, Diagnosis, Treatment, Medication), Date, Status
- **Validation**: Required fields with proper formatting
- **API Integration**: POST to `/api/users/:id/health-events`

### 4. Diet Logs Tracking
**Location**: Right column, middle card
**Purpose**: Log and monitor daily food intake

**Features**:
- **Dual View Tabs**: "My Logs" vs "Doctor Advice"
- **Food Item Display**: List of logged meals with details
- **Quick Add**: Plus button to add new diet entries
- **Entry Details**:
  - Meal type (Breakfast, Lunch, Dinner, Snack)
  - Food items with quantities
  - Date of consumption
  - Source tagging

**Add Diet Log Modal**:
- **Form Fields**: Meal type, Food items (name & quantity), Date
- **Dynamic Inputs**: Multiple food items can be added
- **API Integration**: POST to `/api/users/:id/diet-logs`

### 5. Lifestyle Records
**Location**: Right column, bottom card
**Purpose**: Track lifestyle habits, activities, and professional advice

**Features**:
- **Dual View Tabs**: "My Notes" vs "Professional Advice"
- **Activity Logging**: Record lifestyle activities and habits
- **Description Display**: Concise view of lifestyle records
- **Source Differentiation**: User entries vs professional recommendations

### 6. Full Meal Plan Dashboard
**Access**: Click "Recommended Meal Plan" card or navigate to `/users/:id/meal-plan`
**Purpose**: Comprehensive meal planning interface with AI-generated meal plans

#### Core Features:

##### A. Settings Panel (Pill-Based Interface)
All settings appear as interactive pills under generated meals:

1. **Meal Plan Duration**:
   - Quick options: 3 Days, 7 Days
   - Custom input: Manual number entry (1-30 days)
   - Max limit: 30 days

2. **Cuisine Preference**:
   - Preset options: SOUTH_INDIAN, NORTH_INDIAN, MEDITERRANEAN, CONTINENTAL
   - Manual input: User can enter custom cuisine or place of residence
   - **Important**: Only one considered at a time (manual overrides preset)

3. **Health Goal**:
   - Preset options: HEALTHY_LIVING, WEIGHT_LOSS, MUSCLE_GAIN, GUT_HEALTH
   - Manual input: User can enter custom health goals
   - Combined approach: Manual input alongside existing options

4. **Ingredient Language**:
   - **Multi-select**: User can choose multiple languages
   - **Default**: English always included
   - Available options: ENGLISH, TELUGU, TAMIL, HINDI, KANNADA
   - AI shows ingredients in all selected languages

##### B. Meal Plan Generation & Display
- **Generate/Regenerate**: Button to create new meal plan based on settings
- **Day Navigation**: Tabs to switch between meal plan days
- **Meal Cards**: Detailed view of each meal with:
  - Meal type (Breakfast, Lunch, Dinner, Snack)
  - Title and description
  - Reasoning (AI explanation for meal choice)
  - Click to view detailed meal information

##### C. Ingredients Management
- **Collapsible Sidebar**: Right-side panel for ingredients
- **Deduplicated List**: Shows unique ingredients across all meals for selected day
- **Multi-language Display**: Shows ingredient names in selected languages
- **Quantity Information**: Precise measurements for each ingredient
- **Visual Organization**: Card-based layout with clear categorization

##### D. Meal Details Modal
- **Access**: Click any meal card
- **Detailed View**: Complete meal information including:
  - Full benefits description
  - Complete ingredient list with quantities
  - Preparation notes
  - Health impact explanation

##### E. Health Warnings
- **AI-Generated Alerts**: Warnings based on user's health profile
- **Visual Indicators**: Amber-colored warning cards
- **Contextual Advice**: Specific recommendations for health conditions

### 7. User Profile & Data Management
**Implicit Features**:
- **Automatic Data Fetching**: Loads user data, health events, diet logs, lifestyle records, and active meal plan on dashboard load
- **Profile Integration**: Uses user's medical conditions, allergies, and medications for personalized recommendations
- **Preference Persistence**: Meal preferences saved and applied to future generations

## Technical Architecture

### Component Structure
1. **UserDashboard** (`app.tsx`): Main dashboard with compact views
2. **MealPlanDashboard** (`MealPlanDashboard.tsx`): Dedicated meal planning interface
3. **Layout Component**: Overall application layout with navigation

### State Management
- **React Hooks**: `useState`, `useEffect` for local state
- **API Integration**: Fetch calls to backend REST API
- **Routing**: React Router for navigation between views

### API Endpoints Used
- `GET /api/users/:id` - User profile
- `GET /api/users/:id/health-events` - Health records
- `GET /api/users/:id/diet-logs` - Diet logs
- `GET /api/users/:id/lifestyle` - Lifestyle records
- `GET /api/users/:id/meal-plans/active` - Active meal plan
- `POST /api/users/:id/meal-plans/generate` - Generate new meal plan
- `POST /api/agent/:userId/chat` - AI chat interactions
- `POST /api/users/:id/health-events` - Add health record
- `POST /api/users/:id/diet-logs` - Add diet log

### UI/UX Features
- **Responsive Design**: Grid layout adapts to screen size (lg:grid-cols-3)
- **Animations**: Framer Motion for smooth transitions and micro-interactions
- **Visual Hierarchy**: Clear typography and spacing
- **Feedback States**: Loading indicators, success states, error handling
- **Accessibility**: Semantic HTML, keyboard navigation support

## User Workflows

### 1. Daily Health Monitoring
1. View AI health suggestions on dashboard
2. Check today's meal plan overview
3. Review recent health records
4. Log new diet entries as meals are consumed
5. Add health events as they occur

### 2. Meal Planning
1. Click "Recommended Meal Plan" card
2. Adjust settings using pill interface
3. Click "Generate Meal Plan"
4. Review meals across days using day tabs
5. Check ingredients in collapsible sidebar
6. Click meals for detailed information

### 3. Health Record Management
1. Switch between "My Logs" and "Doctor Reports" tabs
2. Click "+" to add new records
3. Fill form with relevant details
4. Submit to save to profile
5. View historical records in chronological list

## Recent Updates & Enhancements

### Meal Plan Dashboard Redesign (Latest)
- **Dedicated Dashboard**: Moved from modal to standalone page (`/users/:id/meal-plan`)
- **Pill-Based Settings**: All preferences now appear as interactive pills
- **Enhanced Preferences**:
  - Duration: 3/7 days + custom input (max 30)
  - Cuisine: Manual input for cuisine/place
  - Health Goal: Manual input alongside presets
  - Language: Multi-select with English always included
- **Collapsible Ingredients**: Right-side sidebar for complete ingredient list

### AI Integration Enhancements
- **Context-Aware Suggestions**: AI analyzes health history for personalized advice
- **Interactive Chat**: Real-time Q&A with health agent
- **Meal Reasoning**: AI explains why each meal was chosen

## Future Considerations
1. **Mobile Optimization**: Enhanced responsive design for mobile devices
2. **Data Visualization**: Charts and graphs for health trend analysis
3. **Integration**: Connect with wearable devices and health apps
4. **Notifications**: Reminders for medications, meals, and health checks
5. **Family Linking**: Share insights and coordinate with family members

## Technical Stack
- **Frontend**: React with TypeScript
- **Styling**: Tailwind CSS with custom configurations
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Routing**: React Router
- **Build Tool**: Webpack via Nx workspace
- **Backend**: NestJS with MongoDB

---

*Last Updated: April 2026*  
*Documentation Version: 2.0*  
*For technical support or feature requests, contact the development team.*