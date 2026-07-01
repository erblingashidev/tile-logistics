export async function readJsonList<T>(res: Response): Promise<T[]> {
  try {
    const data: unknown = await res.json();
    if (Array.isArray(data)) return data as T[];
    return [];
  } catch {
    return [];
  }
}

export async function readJsonListWithError<T>(
  res: Response
): Promise<{ data: T[]; error?: string }> {
  try {
    const data: unknown = await res.json();
    if (!res.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : `Request failed (${res.status})`;
      return { data: [], error: message };
    }
    if (Array.isArray(data)) return { data: data as T[] };
    return { data: [], error: "Unexpected response from server" };
  } catch {
    return { data: [], error: "Could not read server response" };
  }
}
