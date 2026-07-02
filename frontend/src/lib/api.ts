import { supabase } from './supabase'

const BASE_URL = import.meta.env.VITE_API_URL

// Helper that automatically attaches auth token to every request
async function authFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) throw new Error('Not authenticated')

  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...options.headers
    }
  })
}

export const api = {
  ingest: (repoUrl: string) =>
    authFetch('/ingest', {
      method: 'POST',
      body: JSON.stringify({ repoUrl })
    }),

  getStatus: (jobId: string) =>
    authFetch(`/status/${jobId}`),

  getGraph: (repoId: string) =>
    authFetch(`/graph/${repoId}`),

  prHunt: (repoId: string, issue: string) =>
    authFetch('/pr-hunt', {
      method: 'POST',
      body: JSON.stringify({ repoId, issue })
    }),

  getSavedRepos: () =>
    authFetch('/repos'),

  deleteRepo: (repoId: string) =>
    authFetch(`/repos/${repoId}`, { method: 'DELETE' })
}