import { useEffect, useState } from 'react';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../services/firebase';

interface UseFirestoreDocResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useFirestoreDoc<T = DocumentData>(
  documentPath: string | null
): UseFirestoreDocResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!documentPath) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const segments = documentPath.split('/');
    const collectionPath = segments.slice(0, -1).join('/');
    const docId = segments[segments.length - 1];
    const docRef = doc(db, collectionPath, docId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData({ id: snapshot.id, ...snapshot.data() } as T);
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [documentPath]);

  return { data, loading, error };
}

export default useFirestoreDoc;
