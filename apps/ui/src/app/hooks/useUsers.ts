import { useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import { getUsers, createUser, deleteUser } from '../lib/api';

export function useUsers() {
  const [users, setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const addUser = useCallback(async (body: Parameters<typeof createUser>[0]) => {
    const user = await createUser(body);
    setUsers(prev => [...prev, user]);
    return user;
  }, []);

  const removeUser = useCallback(async (id: string) => {
    await deleteUser(id);
    setUsers(prev => prev.filter(u => u._id !== id));
  }, []);

  return { users, loading, error, refetch: fetchUsers, addUser, removeUser };
}
