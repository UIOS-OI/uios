"use client";

import { useFrame, type RootState } from "@react-three/fiber";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

export type RenderTask = (state: RootState, delta: number, elapsed: number) => void;

type RegisteredTask = { id: string; priority: number; run: RenderTask };
type RenderLoopController = {
  register: (task: RegisteredTask) => () => void;
  run: RenderTask;
};

const RenderLoopContext = createContext<RenderLoopController | null>(null);

function RenderLoopDriver() {
  const controller = useContext(RenderLoopContext);

  useFrame((state, delta) => {
    controller?.run(state, delta, state.clock.elapsedTime);
  });

  return null;
}

export function RenderLoop({ children }: { children: ReactNode }) {
  const tasks = useRef(new Map<string, RegisteredTask>());
  const orderedTasks = useRef<RegisteredTask[]>([]);

  const register = useCallback((task: RegisteredTask) => {
    tasks.current.set(task.id, task);
    orderedTasks.current = [...tasks.current.values()].sort(
      (left, right) => left.priority - right.priority,
    );

    return () => {
      tasks.current.delete(task.id);
      orderedTasks.current = [...tasks.current.values()].sort(
        (left, right) => left.priority - right.priority,
      );
    };
  }, []);

  const run = useCallback<RenderTask>((state, delta, elapsed) => {
    const boundedDelta = Math.min(delta, 1 / 20);
    for (const task of orderedTasks.current) task.run(state, boundedDelta, elapsed);
  }, []);

  const controller = useMemo(() => ({ register, run }), [register, run]);

  return (
    <RenderLoopContext.Provider value={controller}>
      <RenderLoopDriver />
      {children}
    </RenderLoopContext.Provider>
  );
}

export function useRenderTask(id: string, task: RenderTask, priority = 0) {
  const controller = useContext(RenderLoopContext);
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    if (!controller) throw new Error("useRenderTask must be used inside RenderLoop.");
    return controller.register({
      id,
      priority,
      run: (state, delta, elapsed) => taskRef.current(state, delta, elapsed),
    });
  }, [controller, id, priority]);
}
