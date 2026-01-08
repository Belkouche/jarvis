import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>(
    'verifying'
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setError('No verification token provided');
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await authApi.verifyMagicLink(token);

        if (response.success && response.data) {
          login(response.data.user, response.data.token);
          setStatus('success');

          // Redirect to dashboard after short delay
          setTimeout(() => {
            navigate('/', { replace: true });
          }, 1500);
        } else {
          setStatus('error');
          setError(response.error || 'Verification failed');
        }
      } catch (err) {
        setStatus('error');
        setError('An error occurred during verification');
      }
    };

    verifyToken();
  }, [searchParams, navigate, login]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-8 text-center">
        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Verifying your link...
            </h1>
            <p className="text-gray-600">
              Please wait while we verify your magic link.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Successfully verified!
            </h1>
            <p className="text-gray-600">
              Redirecting you to the dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Verification failed
            </h1>
            <p className="text-gray-600 mb-6">
              {error || 'The magic link is invalid or has expired.'}
            </p>
            <Link to="/login" className="btn-primary">
              Request a new link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
