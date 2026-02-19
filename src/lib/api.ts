/**
 * API Abstraction Layer
 * ─────────────────────
 * Set VITE_USE_MOCK=true  → returns mock data (current dev mode)
 * Set VITE_USE_MOCK=false → calls real backend REST endpoints
 *
 * This file is the single toggle point between mock and production data.
 * Once a backend is ready, implement each function body under the `else` branch.
 */

import type { Medicine, Batch, Sale, Supplier, Customer, Purchase } from '@/types';
import { initializeMockData } from '@/data/mockData';

const _env = (import.meta as unknown as { env: Record<string, string> }).env ?? {};
const USE_MOCK = _env['VITE_USE_MOCK'] !== 'false';
const BASE_URL = _env['VITE_API_URL'] ?? 'http://localhost:8000/api';

// ─── Generic fetch wrapper (production path) ──────────────────────────────
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
    },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Medicines ────────────────────────────────────────────────────────────
export async function getMedicines(): Promise<Medicine[]> {
  if (USE_MOCK) return initializeMockData().medicines;
  return apiFetch<Medicine[]>('/medicines/');
}

export async function createMedicine(data: Omit<Medicine, 'id' | 'createdAt' | 'updatedAt'>): Promise<Medicine> {
  if (USE_MOCK) throw new Error('createMedicine: mock write not supported — use the store directly');
  return apiFetch<Medicine>('/medicines/', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Batches ──────────────────────────────────────────────────────────────
export async function getBatches(medicineId?: string): Promise<Batch[]> {
  if (USE_MOCK) {
    const batches = initializeMockData().batches;
    return medicineId ? batches.filter((b) => b.medicineId === medicineId) : batches;
  }
  const qs = medicineId ? `?medicine_id=${medicineId}` : '';
  return apiFetch<Batch[]>(`/batches/${qs}`);
}

// ─── Sales ────────────────────────────────────────────────────────────────
export async function getSales(): Promise<Sale[]> {
  if (USE_MOCK) return initializeMockData().sales;
  return apiFetch<Sale[]>('/sales/');
}

export async function createSale(data: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>): Promise<Sale> {
  if (USE_MOCK) throw new Error('createSale: mock write not supported — use the store directly');
  return apiFetch<Sale>('/sales/', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Suppliers ────────────────────────────────────────────────────────────
export async function getSuppliers(): Promise<Supplier[]> {
  if (USE_MOCK) return initializeMockData().suppliers;
  return apiFetch<Supplier[]>('/suppliers/');
}

// ─── Customers ────────────────────────────────────────────────────────────
export async function getCustomers(): Promise<Customer[]> {
  if (USE_MOCK) return initializeMockData().customers;
  return apiFetch<Customer[]>('/customers/');
}

// ─── Purchases ────────────────────────────────────────────────────────────
export async function getPurchases(): Promise<Purchase[]> {
  if (USE_MOCK) return initializeMockData().purchases;
  return apiFetch<Purchase[]>('/purchases/');
}
