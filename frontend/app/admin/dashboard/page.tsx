'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getAuth, clearAuth } from '@/lib/auth';
import toast from 'react-hot-toast';
import StudentsList from '@/components/StudentsList';
import AddStudentModal from '@/components/AddStudentModal';
import EditStudentModal from '@/components/EditStudentModal';

interface DashboardStats {
  totalStudents: number;
  totalRevenue: number;
  totalPending: number;
  paidStudents: number;
  pendingStudents: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const auth = getAuth();
    if (!auth || auth.user.role !== 'admin') {
      router.push('/admin/login');
      return;
    }

    fetchStats();
  }, [refreshKey]);

  const fetchStats = async () => {
    try {
      const response = await api.get('/api/admin/dashboard');
      setStats(response.data);
    } catch (error: any) {
      toast.error('Failed to load dashboard data');
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

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

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
      <header className="bg-gray-800 shadow-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-sm text-gray-400">Rajshree Library Management</p>
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
        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Students</p>
                  <p className="text-3xl font-bold text-white mt-2">{stats.totalStudents}</p>
                </div>
                <div className="w-12 h-12 bg-blue-900/50 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Paid Students</p>
                  <p className="text-3xl font-bold text-green-400 mt-2">{stats.paidStudents}</p>
                </div>
                <div className="w-12 h-12 bg-green-900/50 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Pending Students</p>
                  <p className="text-3xl font-bold text-red-400 mt-2">{stats.pendingStudents}</p>
                </div>
                <div className="w-12 h-12 bg-red-900/50 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Pending</p>
                  <p className="text-3xl font-bold text-amber-400 mt-2">₹{stats.totalPending.toFixed(2)}</p>
                </div>
                <div className="w-12 h-12 bg-amber-900/50 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Revenue</p>
                  <p className="text-3xl font-bold text-indigo-400 mt-2">₹{stats.totalRevenue.toFixed(2)}</p>
                </div>
                <div className="w-12 h-12 bg-indigo-900/50 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Batch Pages */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6 mb-8 border border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">Batch Slots</h2>
              <p className="text-sm text-gray-400">Manage Morning / Afternoon / Evening batches (92 seats each)</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/batches/morning" className="px-4 py-2 bg-blue-900/50 text-blue-300 rounded-lg font-semibold hover:bg-blue-800/50 transition-colors border border-blue-700">
                Morning Batch
              </Link>
              <Link href="/admin/batches/afternoon" className="px-4 py-2 bg-purple-900/50 text-purple-300 rounded-lg font-semibold hover:bg-purple-800/50 transition-colors border border-purple-700">
                Afternoon Batch
              </Link>
              <Link href="/admin/batches/evening" className="px-4 py-2 bg-indigo-900/50 text-indigo-300 rounded-lg font-semibold hover:bg-indigo-800/50 transition-colors border border-indigo-700">
                Evening Batch
              </Link>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Students Management</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
          >
            + Add New Student
          </button>
        </div>

        {/* Students List */}
        <StudentsList
          key={refreshKey}
          onEdit={(student) => setEditingStudent(student)}
          onRefresh={handleRefresh}
        />

        {/* Modals */}
        {showAddModal && (
          <AddStudentModal
            onClose={() => setShowAddModal(false)}
            onSuccess={() => {
              setShowAddModal(false);
              handleRefresh();
            }}
          />
        )}

        {editingStudent && (
          <EditStudentModal
            student={editingStudent}
            onClose={() => setEditingStudent(null)}
            onSuccess={() => {
              setEditingStudent(null);
              handleRefresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
