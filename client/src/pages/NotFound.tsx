import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <h2 className="font-display text-xl font-semibold text-ink">Page not found</h2>
      <p className="text-sm text-ink-muted">That page doesn't exist.</p>
      <Button onClick={() => navigate('/')}>Back to Overview</Button>
    </div>
  );
}
