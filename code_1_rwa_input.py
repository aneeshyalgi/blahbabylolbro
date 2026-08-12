balance_sheet_by_product = {
    'Loan': 'OnBalance',
    'Deposit': 'OnBalance',
    'Security': 'OnBalance',
    'Limit': 'OffBalance',
    'Guarantee': 'OffBalance',
}
df['BalanceSheetType'] = df['BalanceSheetType'].fillna(df['ProductType'].map(balance_sheet_by_product))

df['Accrued Interests'] = df['Accrued Interests'].fillna(0.0)
df['Market Value'] = df['Market Value'].fillna(0.0)
df['Assessment Base'] = df['Assessment Base'].fillna(df['Accrued Interests'].fillna(0.0) + df['Book Value'].fillna(0.0))

ccf_by_balance_sheet = {
    'OnBalance': 1.0,
    'OffBalance': 0.2,
}
df['CCF'] = df['CCF'].fillna(df['BalanceSheetType'].map(ccf_by_balance_sheet))
df['EAD'] = df['EAD'].fillna(df['Assessment Base'] * df['CCF'])

risk_weight_by_asset_class = {
    'Corporates': 1.0,
    'Banks': 0.5,
    'Sovereigns': 0.0,
}
df['Risk Weight'] = df['Risk Weight'].fillna(df['Asset Class'].map(risk_weight_by_asset_class))
df['RWA'] = df['RWA'].fillna(df['EAD'] * df['Risk Weight'])