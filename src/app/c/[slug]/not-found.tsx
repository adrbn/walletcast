export default function CardNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-10 text-center">
      <div>
        <h1 className="text-xl font-semibold">Card not found</h1>
        <p className="text-sm text-muted">The link may be wrong or the card was removed.</p>
      </div>
    </main>
  );
}
