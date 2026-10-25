import { Navigate, Outlet } from 'react-router-dom';
import { useAuthMe } from '../hooks/useAuth';
import { BrandLoader } from './BrandLoader';

export function ProtectedRoute() {
  const { data: user, isLoading } = useAuthMe();

  // Not null: the session check is a network round trip, and returning
  // nothing meant a blank white screen for its whole duration on every
  // cold load.
  if (isLoading) return <BrandLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
