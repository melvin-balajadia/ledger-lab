import { Navigate, Outlet } from 'react-router-dom';
import { useAuthMe } from '../hooks/useAuth';

export function ProtectedRoute() {
  const { data: user, isLoading } = useAuthMe();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
