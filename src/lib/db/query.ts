export async function dbAll<T>(q: Promise<T[]>): Promise<T[]> {
  return q;
}

export async function dbOne<T>(q: Promise<T[]>): Promise<T | undefined> {
  const rows = await q;
  return rows[0];
}
