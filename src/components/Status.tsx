export function Loading({ label = 'Loading library' }: { label?: string }) {
  return <div className="status"><span className="status-rule" />{label}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <section className="empty-state" role="alert">
      <p className="eyebrow">Content error</p>
      <h1>The library could not be opened.</h1>
      <p>{message}</p>
    </section>
  );
}
