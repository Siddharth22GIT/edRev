"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Student } from "@edurev/types";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface MyProfile {
  /** The signed-in student's own record (null for staff roles). */
  student: Student | null;
  loading: boolean;
  /** Replace the cached record after a successful update (photo, bio, skills…). */
  setStudent: (student: Student) => void;
  refresh: () => void;
}

const MyProfileContext = createContext<MyProfile | undefined>(undefined);

/** Keeps the signed-in student's profile in one place so a new photo shows everywhere at once. */
export function MyProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const studentId = user?.role === "STUDENT" ? user.studentId || user.id : null;

  useEffect(() => {
    if (!studentId) {
      setStudent(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    apiFetch(`/students/${studentId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setStudent(json?.data ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, version]);

  return (
    <MyProfileContext.Provider value={{ student, loading, setStudent, refresh: () => setVersion((v) => v + 1) }}>
      {children}
    </MyProfileContext.Provider>
  );
}

export function useMyProfile() {
  const context = useContext(MyProfileContext);
  if (!context) throw new Error("useMyProfile must be used within a MyProfileProvider");
  return context;
}
