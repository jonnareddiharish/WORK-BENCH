# WorkBench Monorepo

A modern NX monorepo with React UI and NestJS backend API, featuring MongoDB integration, Biome for linting/formatting, Jest for testing, and Dev Container support.

## Tech Stack

- **NX Monorepo** - Build system and project management
- **Node.js** - Runtime environment
- **TypeScript** - Type-safe development
- **Biome** - Linting and formatting (replaces Prettier/ESLint)
- **Jest** - Testing framework
- **Babel** - JavaScript compiler
- **MongoDB** - NoSQL database
- **React** - Frontend library (with webpack)
- **NestJS** - Backend framework (with Mongoose)
- **webpack** - Module bundler
- **Tailwind CSS** - Utility-first CSS framework

## Project Structure

```
work-bench/
├── apps/
│   ├── api/        # Work Bench NestJS backend API
│   │   ├── .env    # Environment configuration
│   │   └── src/    # Source code (including MongoDB integration)
│   └── ui/         # Work Bench UI application
│       └── src/    # React frontend with user creation/dashboard
├── libs/           # Shared libraries (future) reusable across apps
├── biome.json      # Biome configuration
├── jest.config.ts  # Jest configuration
├── nx.json         # NX workspace configuration
└── package.json    # All dependencies required for all apps
```

## Getting Started

### Prerequisites

- Node.js 22 or later
- npm 10 or later
- MongoDB running locally (default: mongodb://localhost:27017)
- Docker & Docker Compose (for dev containers) - optional, can use Podman

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   cd work-bench
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp apps/api/.env.example apps/api/.env
   # Edit apps/api/.env if needed
   ```

4. Start MongoDB (if not already running):
   ```bash
   # For Windows with MongoDB installed as service, it should be running
   # Or use Docker:
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

### Available Scripts

The project includes the following npm scripts in `package.json`:

#### Development
- `npm run start:api` - Start the backend API server
- `npm run start:ui` - Start the frontend development server
- `npm run start:all` or `npm run dev` - Start both API and UI simultaneously
- `npm run serve` - Alias for start:all

#### Building
- `npm run build:api` - Build the backend API for production
- `npm run build:ui` - Build the frontend UI for production
- `npm run build:all` or `npm run build` - Build both API and UI

#### Testing
- `npm run test:api` - Run tests for the backend API
- `npm run test:ui` - Run tests for the frontend UI
- `npm run test:all` - Run all tests

#### Code Quality
- `npm run lint` - Run Biome linting
- `npm run format` - Format code with Biome

### Development

Run the backend API:
```bash
npm run start:api
# or
npx nx serve api
```
API will be available at http://localhost:3000

Run the frontend UI:
```bash
npm run start:ui
# or
npx nx serve ui
```
UI will be available at http://localhost:4200

Run both simultaneously:
```bash
npm run dev
# or
npx nx run-many --target=serve --projects=api,ui
```

### API Endpoints

- `GET /api/users` - Get all users
- `POST /api/users` - Create a new user
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `GET /api/users/search?name=...` - Search users by name

### User Creation Flow

1. When a user lands on the homepage, they can create a user with basic details (name, date of birth)
2. If the user is already created, they will land on the homepage with user details tab on the top right corner
3. User data is stored in MongoDB

### Code Quality

- **Biome** is configured for linting and formatting
- Run formatting: `npm run format` or `npx biome format . --write`
- Run linting: `npm run lint` or `npx biome lint .`
- **Jest** is configured for testing
- Run tests: `npm run test:api` or `npm run test:ui` or `npx nx test api` or `npx nx test ui`

### Building for Production

Build all applications:
```bash
npm run build
# or
npx nx run-many --target=build --projects=api,ui
```

Build individual applications:
```bash
npm run build:api
# or
npx nx build api

npm run build:ui
# or
npx nx build ui
```

### Docker Support

Dev container configuration is available for consistent development environment. To use with VS Code Dev Containers:

1. Install Docker or Podman
2. Open the project in VS Code
3. Reopen in Container when prompted

## Future Enhancements

- Add authentication and authorization
- Implement family and person management (one family can contain many persons)
- Add more comprehensive testing
- Implement CI/CD pipeline
- Add shared libraries in `libs/` directory
- Implement real-time features with WebSockets

## License

MIT
