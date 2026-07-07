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
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const hint = text.trimStart().startsWith("<")
      ? "Server returned an HTML error page"
      : text.slice(0, 120).trim();
    return {
      data: [],
      error: hint
        ? `Could not read server response (${res.status}): ${hint}`
        : `Could not read server response (${res.status})`,
    };
  }

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
}
