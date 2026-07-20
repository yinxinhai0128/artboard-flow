# ArtboardFlow Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone and embeddable infinite canvas module that reproduces the reference project's canvas, node, connection, history, and project-management behavior.

**Architecture:** The frontend exposes a focused React canvas module under `src/canvas/`, wrapped by a demo app in `src/App.tsx`. The backend stores complete project documents in SQLite through Fastify APIs so the module can later be embedded in another AI media site without depending on browser-only storage.

**Tech Stack:** Vite, React, TypeScript, Fastify, Node built-in SQLite, lucide-react.

## Global Constraints

- Project path is `D:\artboard-flow`.
- Product name is `ArtboardFlow`, package name is `artboard-flow`.
- Use Simplified Chinese for UI and project docs.
- Rebuild behavior independently; do not copy AGPL source code from the reference project.
- First phase includes canvas projects, infinite pan/zoom, node creation/editing, node resize/drag, selection/marquee, connections, mini-map, undo/redo, copy/paste, JSON import/export, and backend persistence.
- First phase excludes real third-party AI generation APIs, prompt library, plugin marketplace, account system, and multi-user sync. The reusable local asset library is now part of the canvas module.

---

## File Structure

- `AGENTS.md`: project-level development constraints.
- `server/index.mjs`: Fastify API, validation, SQLite persistence.
- `src/canvas/types.ts`: project, node, connection, viewport, selection types.
- `src/canvas/geometry.ts`: coordinate conversion and connection geometry.
- `src/canvas/api.ts`: frontend API client for project persistence.
- `src/canvas/useCanvasController.ts`: canvas state operations and history.
- `src/canvas/CanvasWorkspace.tsx`: embeddable canvas UI and interactions.
- `src/App.tsx`: standalone shell with project library and editor route state.
- `src/index.css`: app and canvas styling.

## Tasks

- [x] Create project scaffold, rename package, write project-level AGENTS and this plan.
- [x] Implement Fastify + SQLite project persistence API.
- [x] Implement canvas types, geometry helpers, API client, and state controller.
- [x] Implement embeddable canvas workspace UI with pan/zoom, nodes, connections, selection, history, and minimap.
- [x] Implement standalone project library shell with create, rename, delete, batch delete, import, export, and editor navigation.
- [x] Build and run verification: TypeScript build, API health check, browser dev server smoke test.
