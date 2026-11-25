// Session Bearer token held strictly in memory (never localStorage or sessionStorage)
let inMemoryToken: string | null = null;
let activeAdminSchoolId: string | null = null;

export function setMemoryAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getMemoryAuthToken(): string | null {
  return inMemoryToken;
}

export function setActiveAdminSchoolId(schoolId: string | null) {
  activeAdminSchoolId = schoolId;
}

export function getActiveAdminSchoolId(): string | null {
  return activeAdminSchoolId;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'NexaSua');

  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  if (activeAdminSchoolId) {
    headers.set('X-NexaSua-School-Id', activeAdminSchoolId);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(`Request failed (${response.status})`, response.status);
    }
    return (await response.text()) as unknown as T;
  }

  const data = (await response.json()) as { error?: string; code?: string };
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status, data.code);
  }
  return data as T;
}

export async function downloadProtectedFile(url: string, fallbackFilename: string) {
  const headers = new Headers();
  headers.set('X-Requested-With', 'NexaSua');
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  if (activeAdminSchoolId) {
    headers.set('X-NexaSua-School-Id', activeAdminSchoolId);
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let message = 'Download failed.';
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
