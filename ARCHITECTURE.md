# PROMETHEUS v2 Architecture

This document outlines the architecture of the Prometheus v2 agentic supply chain platform. 

## High-Level Overview

The system is built as a single-page Next.js application using the App Router, combining a rich interactive dashboard with a stateless agentic backend that implements the **Observe → Reason → Decide → Act → Learn** loop.

## 1. Frontend Architecture (Next.js)

The frontend is a React application styled with Tailwind CSS, organized into specialized dashboard panels.

### Core UI Components (`src/components/`)
- **MapCanvas.tsx**: Renders dual maps showing the real-world state alongside a shadow "+6h predicted" state.
- **MetricsBar.tsx**: Displays header KPIs (Cost Delta, Confidence, Human Interventions) and controls the agent loop.
- **LoopBar.tsx**: Visualizes the current state of the Agentic Loop.
- **Panel Components**: Specialized views mapping to the agent stages (e.g., `SignalPanel.tsx` for Observe, `HypothesisPanel.tsx` for Reason, `DecisionPanel.tsx` for Decide/Act, `LearningPanel.tsx` for Learn).

### Layout & Routing (`src/app/`)
- **page.tsx**: The main dashboard that orchestrates the layout of maps, panels, and global state.
- **layout.tsx**: Global layout structure and context providers.
- **globals.css**: Tailwind directives and global styles customized for the "Cyber-Cyphe" minimalist aesthetic.

## 2. Agentic Backend Structure

The core "brain" of Prometheus resides in the `src/lib/` and is exposed via Next.js API Routes in `src/app/api/`.

### Core Logic (`src/lib/`)
- **agent.ts**: Implements the 5-stage loop functions:
  - `observe()`: Ingests mock telemetry and environment data.
  - `reason()`: Applies Bayesian confidence models to predict SLA breaches.
  - `decide()`: Applies the autonomy matrix to determine interventions based on confidence and cost thresholds.
  - `act()`: Stages autonomous actions or escalates to human queues.
  - `learn()`: Adjusts internal thresholds based on outcomes.
- **data.ts**: Contains the mock logistics payload, carrier behaviors, SLA constraints, and autonomy policy matrix.
- **types.ts**: TypeScript interfaces and types for signals, hypotheses, actions, and system state.
- **geminiReason.ts / geminiExplain.ts**: Service layers that format payloads and communicate with the Gemini generative AI suite.

### API Routes (`src/app/api/`)
- **/agent/cycle (POST)**: Triggers one complete O-R-D-A-L loop cycle.
- **/agent/approve (POST)**: Endpoint for humans to approve/reject escalated actions.
- **/ai/reason (POST)**: Calls the Gemini API to provide natural-language reasoning for detected anomalies.
- **/ai/explain (POST)**: Calls the Gemini API to explain the final decisions.
- **/ai/dummy (POST)**: An elegant fallback endpoint that returns mock AI responses when the Gemini API quota is exhausted.

## 3. AI & Data Integration

- **Model Integration**: Utilizes Google's `gemini-2.5-flash` model for high-speed, cost-effective reasoning.
- **Resilience**: The architecture includes automatic fallback mechanisms (via the `dummy` endpoints) to ensure the presentation layer never breaks, even if the LLM API is unavailable.
- **State Management**: The application simulates a live database by holding mock supply chain state in React state or lightweight server-side contexts during testing.

## Summary

Prometheus v2 is entirely self-contained within this Next.js repository, enabling rapid iteration and seamless deployment of the full AI-driven supply chain simulation without needing external databases or complex microservices.
