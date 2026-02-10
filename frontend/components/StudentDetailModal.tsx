'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function StudentDetailModal({ student, onClose, onRefresh }: { student: any; onClose: () => void; onRefresh: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get(`/api/payments/student/${student.id}/stats`);
      setStats(response.data);
    } catch (error: any) {
      toast.error('Failed to load student details');
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Student Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Profile Info */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Profile Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-400">Name</p>
                  <p className="text-lg font-medium text-white">{student.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Mobile Number</p>
                  <p className="text-lg font-medium text-white">{student.mobile}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Parent Mobile Number</p>
                  <p className="text-lg font-medium text-white">{student.parent_mobile || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-400">Address</p>
                  <p className="text-lg font-medium text-white whitespace-pre-wrap">{student.address || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Batch</p>
                  <p className="text-lg font-medium text-white">{student.batch ? `${student.batch} batch` : '-'}</p>
                </div>
                <div>
              <p className="text-sm text-gray-400">Timing</p>
              <p className="text-lg font-medium text-white">{student.timing || '-'}</p>
            </div>
            <div>
                  <p className="text-sm text-gray-400">Seat Number</p>
                  <p className="text-lg font-medium text-indigo-400">{student.seat_number ? `Seat ${student.seat_number}` : 'Not assigned'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Membership Start Date</p>
                  <p className="text-lg font-medium text-white">
                    {format(new Date(student.membership_start_date), 'dd MMM yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Membership End Date</p>
                  <p className="text-lg font-medium text-white">
                    {format(new Date(student.membership_end_date), 'dd MMM yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Monthly Due Date</p>
                  <p className="text-lg font-medium text-white">{student.monthly_due_date}th of each month</p>
                </div>
                {student.password && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-400">Password (Stored Hash - Admin Only)</p>
                    <p className="text-sm font-mono text-gray-300 bg-gray-900 p-2 rounded break-all border border-gray-700">{student.password}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Stats */}
            {stats && (
              <>
                <div className="border-t border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Payment Summary</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                      <p className="text-sm text-gray-400">Monthly Fee</p>
                      <p className="text-2xl font-bold text-white">₹{stats.monthlyFee}</p>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                      <p className="text-sm text-gray-400">Total Paid</p>
                      <p className="text-2xl font-bold text-green-400">₹{(stats.paidAmount || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                      <p className="text-sm text-gray-400">Total Library Fee</p>
                      <p className="text-2xl font-bold text-white">₹{(stats.totalFee || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                      <p className="text-sm text-gray-400">Remaining</p>
                      <p className="text-2xl font-bold text-red-400">₹{(stats.remaining || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Payment History */}
                {stats.payments && stats.payments.length > 0 && (
                  <div className="border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Payment History</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-2 px-4 text-gray-300 font-semibold">Date</th>
                            <th className="text-left py-2 px-4 text-gray-300 font-semibold">Amount</th>
                            <th className="text-left py-2 px-4 text-gray-300 font-semibold">Month</th>
                            <th className="text-left py-2 px-4 text-gray-300 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.payments.map((payment: any) => (
                            <tr key={payment.id} className="border-b border-gray-700">
                              <td className="py-2 px-4 text-white">
                                {format(new Date(payment.payment_date), 'dd MMM yyyy')}
                              </td>
                              <td className="py-2 px-4 text-white font-medium">₹{payment.amount}</td>
                              <td className="py-2 px-4 text-gray-400">
                                {new Date(2000, payment.month - 1).toLocaleString('default', { month: 'long' })} {payment.year}
                              </td>
                              <td className="py-2 px-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  payment.status === 'paid' 
                                    ? 'bg-green-900 text-green-200' 
                                    : 'bg-yellow-900 text-yellow-200'
                                }`}>
                                  {payment.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
