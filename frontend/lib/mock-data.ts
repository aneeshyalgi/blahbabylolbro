export const mockDatasets = [
  {
    id: "1",
    name: "Q4_2025_Portfolio_Analysis.xlsx",
    uploadDate: "2025-12-15",
    version: "v1.2",
    status: "Processed",
  },
  {
    id: "2",
    name: "Credit_Risk_Assessment.xlsx",
    uploadDate: "2025-12-18",
    version: "v2.0",
    status: "Uploaded",
  },
  {
    id: "3",
    name: "Market_Risk_Data.xlsx",
    uploadDate: "2025-12-20",
    version: "v1.0",
    status: "Failed",
  },
  {
    id: "4",
    name: "Regulatory_Capital.xlsx",
    uploadDate: "2025-12-22",
    version: "v3.1",
    status: "Processed",
  },
];

export const mockInputData = [
  {
    dealId: "DL-2025-001",
    productType: "Corporate Loan",
    balanceSheet: "Banking Book",
    nominal: 5000000,
    bookValue: 4850000,
    accruedInterest: 45000,
    marketValue: 4920000,
    assessmentBase: 4900000,
    ccf: 1.0,
    ead: 4900000,
    riskWeight: 0.75,
    rwa: 3675000,
  },
  {
    dealId: "DL-2025-002",
    productType: "Mortgage",
    balanceSheet: "Banking Book",
    nominal: 2500000,
    bookValue: 2480000,
    accruedInterest: null,
    marketValue: 2510000,
    assessmentBase: 2500000,
    ccf: 1.0,
    ead: 2500000,
    riskWeight: 0.35,
    rwa: 875000,
  },
  {
    dealId: "DL-2025-003",
    productType: "Credit Line",
    balanceSheet: "Trading Book",
    nominal: 10000000,
    bookValue: null,
    accruedInterest: 125000,
    marketValue: null,
    assessmentBase: 7500000,
    ccf: 0.75,
    ead: 5625000,
    riskWeight: 1.0,
    rwa: 5625000,
  },
  {
    dealId: "DL-2025-004",
    productType: "Bond",
    balanceSheet: "Trading Book",
    nominal: 8000000,
    bookValue: 7950000,
    accruedInterest: 80000,
    marketValue: 8100000,
    assessmentBase: null,
    ccf: 1.0,
    ead: null,
    riskWeight: 0.2,
    rwa: null,
  },
  {
    dealId: "DL-2025-005",
    productType: "Derivative",
    balanceSheet: "Trading Book",
    nominal: 15000000,
    bookValue: null,
    accruedInterest: null,
    marketValue: 350000,
    assessmentBase: 500000,
    ccf: null,
    ead: 500000,
    riskWeight: null,
    rwa: null,
  },
];

export const mockResultData = [
  {
    dealId: "DL-2025-001",
    productType: "Corporate Loan",
    balanceSheet: "Banking Book",
    nominal: 5000000,
    bookValue: 4850000,
    accruedInterest: 45000,
    marketValue: 4920000,
    assessmentBase: 4900000,
    ccf: 1.0,
    ead: 4900000,
    riskWeight: 0.75,
    rwa: 3675000,
    computed: [],
  },
  {
    dealId: "DL-2025-002",
    productType: "Mortgage",
    balanceSheet: "Banking Book",
    nominal: 2500000,
    bookValue: 2480000,
    accruedInterest: 12500,
    marketValue: 2510000,
    assessmentBase: 2500000,
    ccf: 1.0,
    ead: 2500000,
    riskWeight: 0.35,
    rwa: 875000,
    computed: ["accruedInterest"],
  },
  {
    dealId: "DL-2025-003",
    productType: "Credit Line",
    balanceSheet: "Trading Book",
    nominal: 10000000,
    bookValue: 9800000,
    accruedInterest: 125000,
    marketValue: 9950000,
    assessmentBase: 7500000,
    ccf: 0.75,
    ead: 5625000,
    riskWeight: 1.0,
    rwa: 5625000,
    computed: ["bookValue", "marketValue"],
  },
  {
    dealId: "DL-2025-004",
    productType: "Bond",
    balanceSheet: "Trading Book",
    nominal: 8000000,
    bookValue: 7950000,
    accruedInterest: 80000,
    marketValue: 8100000,
    assessmentBase: 8030000,
    ccf: 1.0,
    ead: 8030000,
    riskWeight: 0.2,
    rwa: 1606000,
    computed: ["assessmentBase", "ead", "rwa"],
  },
  {
    dealId: "DL-2025-005",
    productType: "Derivative",
    balanceSheet: "Trading Book",
    nominal: 15000000,
    bookValue: 14500000,
    accruedInterest: 75000,
    marketValue: 350000,
    assessmentBase: 500000,
    ccf: 0.5,
    ead: 500000,
    riskWeight: 1.5,
    rwa: 750000,
    computed: ["bookValue", "accruedInterest", "ccf", "riskWeight", "rwa"],
  },
];

export const mockReportData = [
  {
    portfolio: "Banking Book",
    category: "Credit Risk",
    metric: "Total EAD",
    amount: 7400000,
  },
  {
    portfolio: "Banking Book",
    category: "Credit Risk",
    metric: "Total RWA",
    amount: 4550000,
  },
  {
    portfolio: "Banking Book",
    category: "Credit Risk",
    metric: "Average Risk Weight",
    amount: 0.615,
  },
  {
    portfolio: "Trading Book",
    category: "Market Risk",
    metric: "Total EAD",
    amount: 14155000,
  },
  {
    portfolio: "Trading Book",
    category: "Market Risk",
    metric: "Total RWA",
    amount: 7981000,
  },
  {
    portfolio: "Trading Book",
    category: "Market Risk",
    metric: "Average Risk Weight",
    amount: 0.564,
  },
  {
    portfolio: "Consolidated",
    category: "Total",
    metric: "Total EAD",
    amount: 21555000,
  },
  {
    portfolio: "Consolidated",
    category: "Total",
    metric: "Total RWA",
    amount: 12531000,
  },
];

export const mockCodeFiles = [
  {
    id: "1",
    name: "calculate_ead.py",
    version: "v2.1",
    timestamp: "2025-12-20 14:30:00",
  },
  {
    id: "2",
    name: "risk_weight_mapping.py",
    version: "v1.5",
    timestamp: "2025-12-18 09:15:00",
  },
  {
    id: "3",
    name: "rwa_computation.py",
    version: "v3.0",
    timestamp: "2025-12-22 16:45:00",
  },
];

export const mockCodeContent = `# Risk Weight Assignment Logic
# Version 3.0

def calculate_rwa(row):
    """
    Calculate Risk-Weighted Assets based on 
    product type and exposure
    """
    ead = row.get('ead')
    risk_weight = row.get('risk_weight')
    
    if ead is None or risk_weight is None:
        return None
    
    return ead * risk_weight

def assign_risk_weight(product_type):
    """
    Assign risk weight based on product category
    """
    weights = {
        'Corporate Loan': 0.75,
        'Mortgage': 0.35,
        'Credit Line': 1.0,
        'Bond': 0.20,
        'Derivative': 1.50
    }
    return weights.get(product_type, 1.0)

def compute_ccf(product_type, utilization):
    """
    Credit Conversion Factor calculation
    """
    if product_type == 'Credit Line':
        return 0.75 if utilization < 0.5 else 0.85
    return 1.0
`;

export const clusters = [
  { value: "prod-eu", label: "Production EU" },
  { value: "prod-us", label: "Production US" },
  { value: "staging", label: "Staging" },
  { value: "dev", label: "Development" },
];
