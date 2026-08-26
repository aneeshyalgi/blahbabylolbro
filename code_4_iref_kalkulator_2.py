for col in ['Saldo', 'Anteilige Zinsen', 'EWB', 'PWB', 'Carrying Amount']:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')

df['Bruttobuchwert'] = df['Saldo'].fillna(0.0) + df['Anteilige Zinsen'].fillna(0.0)

df['Carrying Amount'] = df['Carrying Amount'].fillna(
    df['Bruttobuchwert'].fillna(0.0) - df['EWB'].fillna(0.0) - df['PWB'].fillna(0.0)
)

# New columns append at the end by default; move Bruttobuchwert next to Carrying Amount.
column_order = [col for col in df.columns if col != 'Bruttobuchwert']
column_order.insert(column_order.index('Carrying Amount'), 'Bruttobuchwert')
df = df[column_order]
