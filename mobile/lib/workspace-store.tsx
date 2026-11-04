import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  demoWorkspace,
  fetchWorkspace,
  workspaceApiBaseUrl,
  type WorkspaceData,
} from './workspace-api.ts';
import { useAuth } from './auth-store.tsx';
import {
  createWorkspaceProject,
  importWorkspaceProject,
  loadSampleWorkspaceProject,
  type ProjectImportResult,
  type RemoteProject,
} from './project-api.ts';
import {
  loadSelectedProjectId,
  saveSelectedProjectId,
} from './project-selection.ts';

export type WorkspaceSyncStatus = 'loading' | 'synced' | 'demo' | 'error';

interface WorkspaceState {
  data: WorkspaceData;
  status: WorkspaceSyncStatus;
  error: string | null;
  refresh: () => void;
  selectedProjectId: string | null;
  selectProject: (projectId: string) => Promise<void>;
  createProject: (title: string) => Promise<RemoteProject>;
  loadSampleProject: () => Promise<RemoteProject>;
  importProject: (form: FormData) => Promise<ProjectImportResult>;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '工作区同步失败';
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user, authorizedFetch } = useAuth();
  const controllerRef = useRef<AbortController | null>(null);
  const [data, setData] = useState<WorkspaceData>(demoWorkspace);
  const [status, setStatus] = useState<WorkspaceSyncStatus>(
    workspaceApiBaseUrl ? 'loading' : 'demo',
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectionReady, setSelectionReady] = useState(false);

  const loadWorkspace = useCallback((projectId: string | null) => {
    if (!workspaceApiBaseUrl) {
      setStatus('demo');
      setError(null);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('loading');
    setError(null);

    void fetchWorkspace(
      workspaceApiBaseUrl,
      authorizedFetch,
      controller.signal,
      projectId,
    )
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setStatus('synced');
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (projectId && errorMessage(reason).includes('项目不存在')) {
          void saveSelectedProjectId(null).then(() => {
            setSelectedProjectId(null);
            loadWorkspace(null);
          });
          return;
        }
        setStatus('error');
        setError(errorMessage(reason));
      });
  }, [authorizedFetch]);

  const refresh = useCallback(() => {
    loadWorkspace(selectedProjectId);
  }, [loadWorkspace, selectedProjectId]);

  useEffect(() => {
    let active = true;
    void loadSelectedProjectId().then((projectId) => {
      if (!active) return;
      setSelectedProjectId(projectId);
      setSelectionReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus === 'loading' || !selectionReady) return;
    loadWorkspace(selectedProjectId);
    return () => controllerRef.current?.abort();
  }, [authStatus, loadWorkspace, selectedProjectId, selectionReady, user?.id]);

  const selectProject = useCallback(async (projectId: string) => {
    await saveSelectedProjectId(projectId);
    setSelectedProjectId(projectId);
    loadWorkspace(projectId);
  }, [loadWorkspace]);

  const createProject = useCallback(async (title: string) => {
    if (!workspaceApiBaseUrl) throw new Error('尚未配置工作区地址');
    const project = await createWorkspaceProject(workspaceApiBaseUrl, title, authorizedFetch);
    await selectProject(project.id);
    return project;
  }, [authorizedFetch, selectProject]);

  const loadSampleProject = useCallback(async () => {
    if (!workspaceApiBaseUrl) throw new Error('尚未配置工作区地址');
    const project = await loadSampleWorkspaceProject(workspaceApiBaseUrl, authorizedFetch);
    await selectProject(project.id);
    return project;
  }, [authorizedFetch, selectProject]);

  const importProjectAction = useCallback(async (form: FormData) => {
    if (!workspaceApiBaseUrl) throw new Error('尚未配置工作区地址');
    const result = await importWorkspaceProject(workspaceApiBaseUrl, form, authorizedFetch);
    await selectProject(result.project.id);
    return result;
  }, [authorizedFetch, selectProject]);

  return (
    <WorkspaceContext.Provider
      value={{
        data,
        status,
        error,
        refresh,
        selectedProjectId,
        selectProject,
        createProject,
        loadSampleProject,
        importProject: importProjectAction,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceState {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace 必须在 WorkspaceProvider 中使用');
  return value;
}
