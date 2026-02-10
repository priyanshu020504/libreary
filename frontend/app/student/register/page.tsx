'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function StudentRegister() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<Array<{ name: string; total_seats: number; filled: number; available: number }>>([]);
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    parent_mobile: '',
    address: '',
    password: '',
    batch: 'morning',
    timing: '09:00 - 10:00',
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/batches');
        setBatches(res.data || []);
      } catch {
        // ok to ignore; dropdown will still work
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/api/auth/student/register', formData);
      toast.success('Registration successful! Please login.');
      router.push('/student/login');
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Registration failed';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const selectedBatch = batches.find((b) => b.name === formData.batch);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl p-8 animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Student Registration</h1>
          <p className="text-gray-600">Rajshree Library Ashta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Enter your full name"
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number *</label>
              <input
                type="tel"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="Student mobile (unique)"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Parent Mobile Number *</label>
              <input
                type="tel"
                value={formData.parent_mobile}
                onChange={(e) => setFormData({ ...formData, parent_mobile: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="Parent mobile number"
                required
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Batch *</label>
              <select
                value={formData.batch}
                onChange={(e) => setFormData({ ...formData, batch: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition bg-white"
                required
              >
                <option value="morning">Morning Batch</option>
                <option value="afternoon">Afternoon Batch</option>
                <option value="evening">Evening Batch</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                {selectedBatch
                  ? `Seats: ${selectedBatch.total_seats} | Filled: ${selectedBatch.filled} | Available: ${selectedBatch.available}`
                  : 'Seats: 92 per batch'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Timing *</label>
              <select
                value={formData.timing}
                onChange={(e) => setFormData({ ...formData, timing: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition bg-white"
                required
              >
                <option value="09:00 - 10:00">09:00 – 10:00</option>
                <option value="10:00 - 11:00">10:00 – 11:00</option>
                <option value="14:30 - 17:30">14:30 – 17:30</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Address *</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition min-h-[110px]"
              placeholder="Enter your full address"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 10 characters.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password *</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
              placeholder="Create a secure password"
              minLength={6}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 6 characters.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/student/login" className="text-primary-600 hover:text-primary-700 font-semibold">
              Login
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-primary-600 hover:text-primary-700 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
