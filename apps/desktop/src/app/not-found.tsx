import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-16">
      <h1 className="text-2xl">Sidan finns inte</h1>
      <p className="text-muted">
        Länken du följde leder ingenstans. Det är inte ditt fel; gå tillbaka till startsidan så
        fortsätter vi därifrån.
      </p>
      <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
        Till Hem
      </Link>
    </div>
  );
}
