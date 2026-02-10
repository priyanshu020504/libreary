'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getAuth, clearAuth } from '@/lib/auth';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface Student {
  id: number;
  name: string;
  mobile: string;
  parent_mobile?: string;
  address?: string;
  batch?: string;
  seat_number?: number;
  membership_start_date: string;
  membership_end_date: string;
  monthly_due_date: number;
}

interface PaymentStats {
  monthlyFee: number;
  membershipStartDate: string;
  membershipEndDate: string;
  monthlyDueDate: number;
  totalFee: number;
  paidAmount: number;
  remaining: number;
  paidCount: number;
  paymentStatus: string;
  payments: any[];
}

export default function StudentDashboard() {
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth();
    if (!auth || auth.user.role !== 'student') {
      router.push('/student/login');
      return;
    }

    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const auth = getAuth();
      const studentResponse = await api.get(`/api/students/${auth?.user.id}`);
      setStudent(studentResponse.data);

      const statsResponse = await api.get(`/api/payments/student/${auth?.user.id}/stats`);
      setStats(statsResponse.data);
    } catch (error: any) {
      toast.error('Failed to load data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    toast.success('Logged out successfully');
    router.push('/');
  };

  // Payment is display-only. No gateway.
  // Batch can only be set during registration; only admin can change batch after creation.

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-900 shadow-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Student Dashboard</h1>
              <p className="text-sm text-gray-400">Rajshree Library Ashta</p>
              <p className="text-lg font-semibold text-indigo-400 mt-1">Your Library, Your Lifeline</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-red-400 hover:text-red-300 font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Library Expired / Remaining Payment Banner */}
        {student && stats && (() => {
          const endDate = new Date(student.membership_end_date);
          const now = new Date();
          const diffMs = endDate.getTime() - now.getTime();
          const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          const isExpired = endDate < now;
          const expiringSoon = !isExpired && daysRemaining <= 5;
          const hasRemaining = stats.remaining > 0;
          if (!isExpired && !hasRemaining && !expiringSoon) return null;

          return (
            <div className={`rounded-xl shadow-lg p-6 mb-6 ${isExpired ? 'bg-red-900/30 border-2 border-red-700' : expiringSoon ? 'bg-red-900/10 border-2 border-red-700' : 'bg-amber-900/30 border-2 border-amber-700'}`}>
              <h2 className="text-xl font-semibold text-white mb-2">
                {isExpired ? 'Library membership expired' : expiringSoon ? 'Membership expiring soon' : 'Remaining payment due'}
              </h2>
              {isExpired && (
                <p className="text-red-300 font-medium mb-2">
                  Your library membership has expired. Please contact admin to renew and clear dues.
                </p>
              )}
              {expiringSoon && (
                <p className="text-yellow-200 font-medium mb-2">
                  Your membership will expire in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-gray-300">Remaining fee:</span>
                  <span className="text-2xl font-bold text-red-400">₹{stats.remaining.toFixed(2)}</span>
                </div>
                {isExpired && (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-800 text-red-100">
                    Library expired
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Remaining amount will show until admin updates your payment.
              </p>
            </div>
          );
        })()}

        {/* Profile Card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Profile Information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400">Name</p>
              <p className="text-lg font-medium text-white">{student?.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Mobile Number</p>
              <p className="text-lg font-medium text-white">{student?.mobile}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Parent Mobile Number</p>
              <p className="text-lg font-medium text-white">{student?.parent_mobile || '-'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-400">Address</p>
              <p className="text-lg font-medium text-white whitespace-pre-wrap">{student?.address || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Selected Batch</p>
              <p className="text-lg font-medium text-white">{student?.batch ? `${student.batch} batch` : '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Timing</p>
              <p className="text-lg font-medium text-white">{(student as any)?.timing || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Seat Number</p>
              <p className="text-lg font-medium text-indigo-400">{student?.seat_number ? `Seat ${student.seat_number}` : 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Membership Start Date</p>
              <p className="text-lg font-medium text-white">
                {student && format(new Date(student.membership_start_date), 'dd MMM yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Membership End Date</p>
              <p className="text-lg font-medium text-white">
                {student && format(new Date(student.membership_end_date), 'dd MMM yyyy')}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Status Card */}
        {stats && (
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">Payment Status</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Monthly Fee</span>
                  <span className="text-lg font-semibold text-white">₹{stats.monthlyFee}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Monthly Due Date</span>
                  <span className="text-lg font-semibold text-white">{stats.monthlyDueDate}th of each month</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Status</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    stats.paymentStatus === 'paid' 
                      ? 'bg-green-900 text-green-200' 
                      : 'bg-red-900 text-red-200'
                  }`}>
                    {stats.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">Payment Summary</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Paid Amount</span>
                  <span className="text-lg font-semibold text-green-400">₹{stats.paidAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total Library Fee</span>
                  <span className="text-lg font-semibold text-white">₹{stats.totalFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-gray-700 pt-4">
                  <span className="text-gray-400 font-semibold">Remaining (due until admin updates)</span>
                  <span className="text-xl font-bold text-red-400">₹{stats.remaining.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Payments Made</span>
                  <span className="text-lg font-semibold text-white">{stats.paidCount} payments</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment History */}
        {stats && stats.payments.length > 0 && (
          <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Payment History</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">Date</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">Amount</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">Month</th>
                    <th className="text-left py-3 px-4 text-gray-300 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-gray-700 hover:bg-gray-900/50">
                      <td className="py-3 px-4 text-white">
                        {format(new Date(payment.payment_date), 'dd MMM yyyy')}
                      </td>
                      <td className="py-3 px-4 text-white font-medium">₹{payment.amount}</td>
                      <td className="py-3 px-4 text-gray-400">
                        {new Date(2000, payment.month - 1).toLocaleString('default', { month: 'long' })} {payment.year}
                      </td>
                      <td className="py-3 px-4">
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
      </div>
    </div>
  );
}
