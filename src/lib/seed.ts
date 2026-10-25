import type { Driver, InventoryItem, Order, Product } from '@/types'

/**
 * Demo dataset for one Laayoune delivery operation. Coordinates are
 * approximate but plausible for inhabited city quarters (see the bounds in
 * src/config/location.ts — seed.test.ts enforces them).
 *
 * This data is NEVER loaded automatically — a fresh app starts completely
 * empty (see src/lib/store.ts). It exists only for the optional
 * "Load demo data" action in the sidebar.
 *
 * Product names are bilingual: `seedProducts(locale)` returns the names in
 * the active UI language (EN/FR) so they match the interface. Drivers,
 * customers and addresses are language-independent.
 *
 * Addresses use quarter + generic landmark descriptors (no invented street
 * names). Quarter names that need manual verification before claiming
 * real-world accuracy: Bréma, Tarfa, Chiroka, Echemma (all used as
 * Laâyoune quarters in local usage; confirm spellings/locations).
 */

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

interface ProductDef {
  id: string
  sku: string
  unit: string
  price: number
  nameEn: string
  nameFr: string
}

const PRODUCT_DEFS: ProductDef[] = [
  { id: 'prd_001', sku: 'FSH-SAR-001', unit: 'kg', price: 45, nameEn: 'Fresh sardines', nameFr: 'Sardines fraîches' },
  { id: 'prd_002', sku: 'FSH-CAN-002', unit: 'pack', price: 12, nameEn: 'Canned sardines (pack of 6)', nameFr: 'Sardines en conserve (lot de 6)' },
  { id: 'prd_003', sku: 'DTE-MJD-003', unit: 'kg', price: 80, nameEn: 'Majhoul dates', nameFr: 'Dattes Majhoul' },
  { id: 'prd_004', sku: 'TEA-MNT-004', unit: 'pack', price: 35, nameEn: 'Mint tea', nameFr: 'Thé à la menthe' },
  { id: 'prd_005', sku: 'SUG-WHT-005', unit: 'kg', price: 9, nameEn: 'White sugar', nameFr: 'Sucre blanc' },
  { id: 'prd_006', sku: 'CSS-SEM-006', unit: 'kg', price: 14, nameEn: 'Couscous (medium)', nameFr: 'Couscous (moyen)' },
  { id: 'prd_007', sku: 'FLR-WHT-007', unit: 'kg', price: 6, nameEn: 'Wheat flour', nameFr: 'Farine de blé' },
  { id: 'prd_008', sku: 'OIL-OLV-008', unit: 'L', price: 45, nameEn: 'Olive oil', nameFr: "Huile d'olive" },
  { id: 'prd_009', sku: 'BRD-TRD-009', unit: 'pack', price: 3, nameEn: 'Traditional bread', nameFr: 'Pain traditionnel' },
  { id: 'prd_010', sku: 'MLK-WHL-010', unit: 'L', price: 8, nameEn: 'Whole milk', nameFr: 'Lait entier' },
  { id: 'prd_011', sku: 'YGT-PLN-011', unit: 'pack', price: 12, nameEn: 'Plain yogurt (pack of 6)', nameFr: 'Yaourt nature (lot de 6)' },
  { id: 'prd_012', sku: 'WTR-BTL-012', unit: 'bottle', price: 5, nameEn: 'Bottled water (1.5 L)', nameFr: 'Eau en bouteille (1,5 L)' },
  { id: 'prd_013', sku: 'GAS-CYL-013', unit: 'cylinder', price: 45, nameEn: 'Cooking gas cylinder', nameFr: 'Bouteille de gaz' },
  { id: 'prd_014', sku: 'DSH-SOP-014', unit: 'bottle', price: 15, nameEn: 'Dish soap', nameFr: 'Liquide vaisselle' },
  { id: 'prd_015', sku: 'EGG-TRAY-015', unit: 'pack', price: 25, nameEn: 'Eggs (tray of 30)', nameFr: 'Œufs (plateau de 30)' },
]

export function seedProducts(locale: string = 'en'): Product[] {
  const isFr = (locale || 'en').toLowerCase().startsWith('fr')
  return PRODUCT_DEFS.map((def) => ({
    id: def.id,
    sku: def.sku,
    unit: def.unit,
    price: def.price,
    name: isFr ? def.nameFr : def.nameEn,
  }))
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const seedInventory: InventoryItem[] = [
  { productId: 'prd_001', quantity: 40, lowStockThreshold: 10 },
  { productId: 'prd_002', quantity: 30, lowStockThreshold: 10 },
  { productId: 'prd_003', quantity: 25, lowStockThreshold: 8 },
  { productId: 'prd_004', quantity: 20, lowStockThreshold: 8 },
  { productId: 'prd_005', quantity: 60, lowStockThreshold: 15 },
  { productId: 'prd_006', quantity: 35, lowStockThreshold: 10 },
  { productId: 'prd_007', quantity: 50, lowStockThreshold: 15 },
  { productId: 'prd_008', quantity: 20, lowStockThreshold: 8 },
  { productId: 'prd_009', quantity: 40, lowStockThreshold: 15 },
  { productId: 'prd_010', quantity: 30, lowStockThreshold: 10 },
  { productId: 'prd_011', quantity: 24, lowStockThreshold: 8 },
  { productId: 'prd_012', quantity: 5, lowStockThreshold: 12 },
  { productId: 'prd_013', quantity: 4, lowStockThreshold: 6 },
  { productId: 'prd_014', quantity: 3, lowStockThreshold: 8 },
  { productId: 'prd_015', quantity: 6, lowStockThreshold: 10 },
]

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export const seedDrivers: Driver[] = [
  { id: 'drv_001', name: 'Sidi Mohamed Taleb', phone: '+212 6 61 23 45 67', vehicle: 'Renault Kangoo — 12345-A-17', status: 'available' },
  { id: 'drv_002', name: 'Salma Boukhari', phone: '+212 6 62 34 56 78', vehicle: 'Fiat Fiorino — 56789-B-17', status: 'on_route' },
  { id: 'drv_003', name: 'Karim Ould Sidi Ali', phone: '+212 7 63 45 67 89', vehicle: 'Yamaha NMAX — 90123-C-17', status: 'on_route' },
  { id: 'drv_004', name: 'Mariem Biadi', phone: '+212 6 64 56 78 90', vehicle: 'Dacia Dokker — 34567-D-17', status: 'available' },
  { id: 'drv_005', name: 'Hamid Bakhta', phone: '+212 7 65 78 90 12', vehicle: 'Peugeot Boxer — 78901-E-17', status: 'off_duty' },
]

// ---------------------------------------------------------------------------
// Orders (timestamps relative to "now" at module load)
// ---------------------------------------------------------------------------

function items(...pairs: Array<[string, number]>): Order['items'] {
  return pairs.map(([productId, qty]) => ({ productId, qty }))
}

function hoursAgo(hours: number, base: number): string {
  return new Date(base - hours * 3600 * 1000).toISOString()
}

export function seedOrders(): Order[] {
  const base = Date.now()
  const ago = (h: number) => hoursAgo(h, base)

  return [
    {
      id: 'ord_001',
      customerName: 'Café Sahara',
      address: 'Centre-ville, near the main market',
      lat: 27.1536, lng: -13.2033,
      items: items(['prd_001', 4], ['prd_006', 2], ['prd_011', 1]),
      status: 'delivered',
      driverId: 'drv_001',
      createdAt: ago(70),
      statusHistory: [{ status: 'delivered', at: ago(68) }],
      deliveryWindowStart: '09:00',
      deliveryWindowEnd: '11:00',
      serviceMinutes: 5,
    },
    {
      id: 'ord_002',
      customerName: 'Mariem Embarek',
      address: 'Bréma quarter, house near the school',
      lat: 27.1447, lng: -13.1967,
      items: items(['prd_002', 1], ['prd_003', 2], ['prd_009', 1]),
      status: 'delivered',
      driverId: 'drv_003',
      createdAt: ago(66),
      statusHistory: [{ status: 'delivered', at: ago(64) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_003',
      customerName: 'Épicerie Tarfa',
      address: 'Tarfa quarter, near the mosque',
      lat: 27.1663, lng: -13.2071,
      items: items(['prd_005', 2], ['prd_007', 3], ['prd_006', 2]),
      status: 'delivered',
      driverId: 'drv_002',
      createdAt: ago(62),
      statusHistory: [{ status: 'delivered', at: ago(60) }],
      deliveryWindowStart: '10:00',
      deliveryWindowEnd: '12:00',
      serviceMinutes: 8,
    },
    {
      id: 'ord_004',
      customerName: 'Zohra Mghizrat',
      address: 'Chiroka quarter, shop on the main road',
      lat: 27.1487, lng: -13.2118,
      items: items(['prd_010', 1], ['prd_012', 1], ['prd_001', 3]),
      status: 'delivered',
      driverId: 'drv_004',
      createdAt: ago(58),
      statusHistory: [{ status: 'delivered', at: ago(56) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_005',
      customerName: 'Habib Ould Ali',
      address: 'Centre-ville, near the post office',
      lat: 27.1567, lng: -13.2022,
      items: items(['prd_011', 6], ['prd_003', 2]),
      status: 'delivered',
      driverId: 'drv_001',
      createdAt: ago(54),
      statusHistory: [{ status: 'delivered', at: ago(52) }],
      deliveryWindowStart: '08:00',
      deliveryWindowEnd: '10:00',
      serviceMinutes: 10,
    },
    {
      id: 'ord_006',
      customerName: 'Yaya Derder',
      address: 'Bréma quarter, near the clinic',
      lat: 27.1456, lng: -13.1988,
      items: items(['prd_008', 5], ['prd_007', 2], ['prd_006', 1]),
      status: 'delivered',
      driverId: 'drv_002',
      createdAt: ago(50),
      statusHistory: [{ status: 'delivered', at: ago(48) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_007',
      customerName: 'Souad Daf',
      address: 'Chiroka quarter, near the school',
      lat: 27.1470, lng: -13.2095,
      items: items(['prd_001', 2], ['prd_004', 1]),
      status: 'in_transit',
      driverId: 'drv_002',
      createdAt: ago(20),
      statusHistory: [{ status: 'in_transit', at: ago(18) }],
      deliveryWindowStart: '09:00',
      deliveryWindowEnd: '11:30',
      serviceMinutes: 5,
    },
    {
      id: 'ord_008',
      customerName: 'Ghali Ould Mohameden',
      address: 'Centre-ville, near the bank',
      lat: 27.1524, lng: -13.2079,
      items: items(['prd_005', 1], ['prd_011', 2]),
      status: 'in_transit',
      driverId: 'drv_003',
      createdAt: ago(18),
      statusHistory: [{ status: 'in_transit', at: ago(16) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_009',
      customerName: 'Nabil Sbai',
      address: 'Tarfa quarter, near the mosque',
      lat: 27.1628, lng: -13.2009,
      items: items(['prd_003', 3], ['prd_009', 1], ['prd_010', 1]),
      status: 'in_transit',
      driverId: 'drv_003',
      createdAt: ago(16),
      statusHistory: [{ status: 'in_transit', at: ago(14) }],
      deliveryWindowStart: '10:00',
      deliveryWindowEnd: '12:00',
      serviceMinutes: 6,
    },
    {
      id: 'ord_010',
      customerName: 'Aicha Bleouikh',
      address: 'Centre-ville, near the market',
      lat: 27.1563, lng: -13.2044,
      items: items(['prd_007', 4], ['prd_006', 6]),
      status: 'assigned',
      driverId: 'drv_001',
      createdAt: ago(14),
      statusHistory: [{ status: 'assigned', at: ago(12) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_011',
      customerName: 'Brahim Salama',
      address: 'Bréma quarter, near the school',
      lat: 27.1439, lng: -13.1974,
      items: items(['prd_002', 1], ['prd_012', 1]),
      status: 'assigned',
      driverId: 'drv_001',
      createdAt: ago(12),
      statusHistory: [{ status: 'assigned', at: ago(10) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_012',
      customerName: 'Khadija Saber',
      address: 'Chiroka quarter, shop on the main road',
      lat: 27.1479, lng: -13.2104,
      items: items(['prd_001', 2], ['prd_011', 6], ['prd_010', 1]),
      status: 'assigned',
      driverId: 'drv_004',
      createdAt: ago(10),
      statusHistory: [{ status: 'assigned', at: ago(8) }],
      deliveryWindowStart: '09:30',
      deliveryWindowEnd: '11:00',
      serviceMinutes: 7,
    },
    {
      id: 'ord_013',
      customerName: 'Moustapha Ould Beibars',
      address: 'Centre-ville, near the post office',
      lat: 27.1538, lng: -13.2001,
      items: items(['prd_005', 3], ['prd_003', 1]),
      status: 'assigned',
      driverId: 'drv_004',
      createdAt: ago(8),
      statusHistory: [{ status: 'assigned', at: ago(6) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_014',
      customerName: 'Fatimetou Ahmed Salem',
      address: 'Tarfa quarter, near the clinic',
      lat: 27.1683, lng: -13.2038,
      items: items(['prd_004', 2], ['prd_008', 2]),
      status: 'pending',
      createdAt: ago(6),
      statusHistory: [{ status: 'pending', at: ago(6) }],
      deliveryWindowStart: '11:00',
      deliveryWindowEnd: '13:00',
      serviceMinutes: 5,
    },
    {
      id: 'ord_015',
      customerName: 'Oumeima Ghouil',
      address: 'Centre-ville, near the market',
      lat: 27.1506, lng: -13.2011,
      items: items(['prd_009', 1], ['prd_003', 1], ['prd_006', 2]),
      status: 'pending',
      createdAt: ago(5),
      statusHistory: [{ status: 'pending', at: ago(5) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_016',
      customerName: 'Hamma Rguibi',
      address: 'Chiroka quarter, near the school',
      lat: 27.1495, lng: -13.2142,
      items: items(['prd_006', 10], ['prd_001', 2]),
      status: 'pending',
      createdAt: ago(4),
      statusHistory: [{ status: 'pending', at: ago(4) }],
      deliveryWindowStart: '09:00',
      deliveryWindowEnd: '10:30',
      serviceMinutes: 8,
    },
    {
      id: 'ord_017',
      customerName: 'Salek Ould Mbarak',
      address: 'Tarfa quarter, near the mosque',
      lat: 27.1647, lng: -13.2049,
      items: items(['prd_007', 5], ['prd_008', 4]),
      status: 'pending',
      createdAt: ago(3),
      statusHistory: [{ status: 'pending', at: ago(3) }],
      serviceMinutes: 5,
    },
    {
      id: 'ord_018',
      customerName: 'Tahra Mint Amor',
      address: 'Centre-ville, near the bank',
      lat: 27.1519, lng: -13.2063,
      items: items(['prd_002', 1], ['prd_003', 4], ['prd_011', 2]),
      status: 'failed',
      driverId: 'drv_005',
      createdAt: ago(2),
      statusHistory: [{ status: 'failed', at: ago(1) }],
      restocked: true,
      serviceMinutes: 5,
    },
    {
      id: 'ord_019',
      customerName: 'El Ghali Kaddour',
      address: 'Echemma quarter, near the clinic',
      lat: 27.1600, lng: -13.1920,
      items: items(['prd_001', 3], ['prd_010', 1]),
      status: 'failed',
      driverId: 'drv_005',
      createdAt: ago(2),
      statusHistory: [{ status: 'failed', at: ago(1) }],
      restocked: true,
      serviceMinutes: 5,
    },
    {
      id: 'ord_020',
      customerName: 'Hafida Daoudi',
      address: 'Northern residential area, near the main road',
      lat: 27.1700, lng: -13.1980,
      items: items(['prd_005', 2], ['prd_004', 1]),
      status: 'cancelled',
      createdAt: ago(1),
      statusHistory: [{ status: 'cancelled', at: ago(0.5) }],
      restocked: true,
      serviceMinutes: 5,
    },
  ]
}