for col in ['Saldo', 'Anteilige Zinsen', 'EWB', 'PWB', 'Carrying Amount']:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')

df['Carrying Amount'] = df['Carrying Amount'].fillna(
    df['Saldo'].fillna(0.0) + df['Anteilige Zinsen'].fillna(0.0) - df['EWB'].fillna(0.0) - df['PWB'].fillna(0.0)
)
