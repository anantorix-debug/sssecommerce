import Image from 'next/image';
import type { ReactNode } from 'react';

const PHOTO = '/images/account.jpg';

export function AuthShell({ title, subtitle, children, image = PHOTO }: { title: string; subtitle?: string; children: ReactNode; image?: string }) {
  return (
    <div className="container-x grid min-h-[80vh] gap-12 py-10 lg:grid-cols-12 lg:items-center lg:py-14">
      <div className="relative hidden aspect-[4/5] overflow-hidden bg-paper-2 lg:col-span-6 lg:block">
        <Image src={image} alt="" fill sizes="50vw" priority className="object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgb(10_9_8/0.55))] p-8 text-white">
          <p className="display-sm max-w-sm">Your orders, delivery slots and saved pieces, all in one place.</p>
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-md gap-8 lg:col-span-5 lg:col-start-8">
        <header className="grid gap-3">
          <h1 className="display-lg">{title}</h1>
          {subtitle && <p className="text-ink-soft">{subtitle}</p>}
        </header>
        {children}
      </div>
    </div>
  );
}
