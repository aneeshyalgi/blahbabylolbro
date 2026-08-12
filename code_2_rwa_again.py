balance_sheet_by_product = {
    'Loan': 'OnBalance',
    'Deposit': 'OnBalance',
    'Security': 'OnBalance',
    'Limit': 'OffBalance',
    'Guarantee': 'OffBalance',
}

for col in ['Nominal', 'Book Value', 'Accrued Interests', 'Market Value', 'Assessment Base', 'CCF', 'Risk Weight', 'EAD', 'RWA']:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')

df['BalanceSheetType'] = df['BalanceSheetType'].fillna(df['ProductType'].map(balance_sheet_by_product))

df['Accrued Interests'] = df['Accrued Interests'].fillna(0.0)
df['Market Value'] = df['Market Value'].fillna(0.0)

# Product-type-specific Assessment Base overrides.
# Keep the original hardcoded default for the rest of the rows.
limit_mask = df['Assessment Base'].isna() & df['ProductType'].eq('Limit')
security_mask = df['Assessment Base'].isna() & df['ProductType'].eq('Security')
guarantee_mask = df['Assessment Base'].isna() & df['ProductType'].eq('Guarantee')

df.loc[limit_mask, 'Assessment Base'] = df.loc[limit_mask, 'Nominal']
df.loc[security_mask, 'Assessment Base'] = df.loc[security_mask, 'Market Value']
df.loc[guarantee_mask, 'Assessment Base'] = df.loc[guarantee_mask, 'Nominal']

df['Assessment Base'] = df['Assessment Base'].fillna(
    df['Accrued Interests'].fillna(0.0) + df['Book Value'].fillna(0.0)
)

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
