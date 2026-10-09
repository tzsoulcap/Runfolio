export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-card border border-line bg-paper p-6 sm:p-8">
      <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
      <p className="mt-2 text-base text-muted">{description}</p>
    </section>
  );
}
