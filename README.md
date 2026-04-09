# Prompt Opinion - FHIR MCP Server (TypeScript)

This project is a high-performance, professionally structured MCP server for the Prompt Opinion platform. It is built with TypeScript and integrates with FHIR servers to deliver reliable, extensible clinical tooling.

The refactored architecture emphasizes performance and maintainability through session pooling, backend connection pooling, decoupled layers, and strong type safety.

## Features

- **Decoupled Architecture**: Layered design across Server, FHIR, Core, and Tools.
- **High Performance**: Singleton `McpServer`, session pooling, and HTTP keep-alive for backend connections.
- **Type-Safe Tools**: Abstract base class for implementing tools independent of transport concerns.
- **Structured Logging**: Pino-based request and application logging.
- **Graceful Shutdown**: Process signal handling for clean shutdown behavior.
- **ESM & Modern TypeScript**: ECMAScript modules with strict TypeScript.

## Project Structure

```text
src/
├─ server/
├─ fhir/
├─ core/
├─ tools/
├─ config/
└─ types/
```

- `src/server`: Express app, `McpServer` lifecycle, and session pooling.
- `src/fhir`: FHIR client, utilities, and FHIR context management.
- `src/core`: Shared error types, logging, and request context.
- `src/tools`: Base tool class, tool implementations, and registry.
- `src/config`: Application constants.
- `src/types`: Shared type definitions.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file from `.env.example` and configure:

- `PORT`
- `LOG_LEVEL`

### Running the Server

Development (hot reload):

```bash
npm run dev
```

Production (after building):

```bash
npm run start
```

## Available Scripts

- `dev`: Run in development mode with hot reload.
- `start`: Run the built server in production mode.
- `build`: Compile TypeScript output.
- `test`: Run tests.
- `lint`: Run lint checks.
- `format`: Format source files.
- `typecheck`: Run TypeScript type checking.

## API Usage

### `POST /mcp`

Main MCP endpoint using Streamable HTTP transport.

Pass FHIR context using request headers:

- `x-fhir-server-url`
- `x-fhir-access-token`
- `x-patient-id`

### `GET /health`

Health check endpoint.

## Extending the Server

To add a new tool:

1. Create a new file in `src/tools/` (for example, `src/tools/my-new.tool.ts`).
2. Create a class that extends `McpTool`.
3. Implement `name`, `description`, `inputSchema`, and `handle`.
4. Add the tool class to the array in `src/tools/registry.ts`.

After restarting the server, the new tool will be registered automatically.
