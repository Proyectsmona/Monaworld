import { Card } from 'primereact/card';

export function Soon({
  title,
  phase,
  detail,
}: {
  title: string;
  phase: string;
  detail: string;
}) {
  return (
    <Card.Root className="mw-panel">
      <Card.Body className="p-8">
        <div className="mw-label">{phase}</div>
        <h2 className="mt-2 font-display text-2xl font-bold">{title}</h2>
        <p className="mt-3 max-w-prose text-mw-muted">{detail}</p>
      </Card.Body>
    </Card.Root>
  );
}
