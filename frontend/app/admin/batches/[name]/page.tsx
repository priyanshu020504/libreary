'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getAuth } from '@/lib/auth';
import toast from 'react-hot-toast';

type BatchName = 'morning' | 'afternoon' | 'evening';

export default function AdminBatchPage() {
  const router = useRouter();
  const params = useParams<{ name: string }>();
  const name = (params?.name || '').toString().toLowerCase() as BatchName;

  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [capacity, setCapacity] = useState<string>('92');

  const title = useMemo(() => {
    if (name === 'morning') return 'Morning Batch';
    if (name === 'afternoon') return 'Afternoon Batch';
    if (name === 'evening') return 'Evening Batch';
    return 'Batch';
  }, [name]);

  const refresh = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/batches/${name}`);
      setBatch(res.data.batch);
      setStudents(res.data.students || []);
      setCapacity(String(res.data.batch?.total_seats ?? 92));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load batch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const auth = getAuth();
    if (!auth || auth.user.role !== 'admin') {
      router.push('/admin/login');
      return;
    }
    if (!['morning', 'afternoon', 'evening'].includes(name)) {
      router.push('/admin/dashboard');
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const moveStudent = async (studentId: number, newBatch: BatchName) => {
    try {
      await api.patch('/batches/move-student', { student_id: studentId, batch: newBatch });
      toast.success('Student moved successfully');
      refresh();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to move student');
    }
  };

  const updateCapacity = async () => {
    const total = Number(capacity);
    if (Number.isNaN(total) || total < 0) {
      toast.error('Capacity must be a valid number (>= 0)');
      return;
    }
    try {
      await api.put(`/batches/${name}`, { total_seats: total });
      toast.success('Seat capacity updated');
      refresh();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update capacity');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-600">Batch-wise students & seat control</p>
            </div>
            <div className="flex gap-3">
              <Link href="/admin/dashboard" className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-semibold text-gray-800">
                ← Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        ) : (
          <>
            {/* Seat cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <p className="text-sm text-gray-600">Total Seats</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{batch?.total_seats ?? 92}</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6">
                <p className="text-sm text-gray-600">Filled Seats</p>
                <p className="text-3xl font-bold text-indigo-600 mt-2">{batch?.filled ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6">
                <p className="text-sm text-gray-600">Available Seats</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{batch?.available ?? 0}</p>
              </div>
            </div>

            {/* Capacity edit */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Adjust total seat capacity (Admin)</label>
                  <input
                    type="number"
                    min={0}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">This changes total seats for this batch.</p>
                </div>
                <button
                  onClick={updateCapacity}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
                >
                  Save Capacity
                </button>
              </div>
            </div>

            {/* Students */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-xl font-bold text-gray-900">Students in {title}</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={loading}
                    className="px-3 py-2 text-sm font-semibold text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  <span className="text-sm text-gray-600">{students.length} students</span>
                </div>
              </div>

              {students.length === 0 ? (
                <div className="text-center py-10 text-gray-500">No students in this batch</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-gray-700 font-semibold">Name</th>
                        <th className="text-left py-3 px-4 text-gray-700 font-semibold">Mobile</th>
                        <th className="text-left py-3 px-4 text-gray-700 font-semibold">Parent</th>
                        <th className="text-left py-3 px-4 text-gray-700 font-semibold">Address</th>
                        <th className="text-left py-3 px-4 text-gray-700 font-semibold">Batch</th>
                        <th className="text-left py-3 px-4 text-gray-700 font-semibold">Payment</th>
                        <th className="text-left py-3 px-4 text-gray-700 font-semibold">Move to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-900 font-medium">{s.name}</td>
                          <td className="py-3 px-4 text-gray-600">{s.mobile}</td>
                          <td className="py-3 px-4 text-gray-600">{s.parent_mobile || '-'}</td>
                          <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate" title={s.address || ''}>{s.address || '-'}</td>
                          <td className="py-3 px-4 text-gray-600 capitalize">{s.batch || '-'}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              s.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {s.paymentStatus === 'paid' ? 'Paid' : `Pending (₹${(s.remaining ?? 0).toFixed(0)})`}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2 items-center">
                              <select
                                defaultValue={name}
                                onChange={(e) => moveStudent(s.id, e.target.value as BatchName)}
                                className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
                              >
                                <option value="morning">Morning</option>
                                <option value="afternoon">Afternoon</option>
                                <option value="evening">Evening</option>
                              </select>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Moves instantly if seats are available.</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

