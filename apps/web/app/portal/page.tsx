import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const benefits = [
  'See active and completed service requests in one place.',
  'Review the properties Premier has on file for your account.',
  'Use the same secure customer sign-in for future invoices and messages.',
];

export default function PortalDoorwayPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="space-y-4 text-center sm:py-8">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Premier Property Maintenance
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Customer portal
        </h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
          Sign in to view your service requests, properties, and account details.
          The portal lives inside Premier CRM at app.ppmnky.com/portal so protected
          customer data stays out of the marketing site.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/portal/login">Sign in or create account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="https://ppmnky.com/request-service">Request service</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {benefits.map((benefit) => (
          <Card key={benefit}>
            <CardHeader>
              <CardTitle className="text-base">Portal benefit</CardTitle>
              <CardDescription>{benefit}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Customer portal accounts are separate from Premier internal staff accounts.
          Customers are linked through customer_accounts and are not added to org_members.
        </CardContent>
      </Card>
    </main>
  );
}
