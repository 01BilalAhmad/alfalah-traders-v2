'use client';

import { useState } from 'react';

const designs = [
  {
    id: 1,
    name: 'Classic Banking',
    desc: 'Navy blue header, white background, card layout, professional banking feel',
    color: 'from-blue-900 to-blue-800',
  },
  {
    id: 2,
    name: 'Modern Fintech',
    desc: 'Green-teal gradient, card-based, Material Design, app-like feel',
    color: 'from-teal-600 to-emerald-600',
  },
  {
    id: 3,
    name: 'Premium Dark',
    desc: 'Dark slate background, gold accents, luxury banking, high contrast',
    color: 'from-amber-700 to-yellow-600',
  },
  {
    id: 4,
    name: 'Minimalist Swiss',
    desc: 'Clean white, navy border stripe, invoice style, no frills',
    color: 'from-slate-700 to-slate-600',
  },
];

export default function ReceiptDesigns() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-center mb-2">Recovery Receipt Designs</h1>
        <p className="text-center text-muted-foreground mb-8">Click on your favorite design to select it</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {designs.map((d) => (
            <div
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={`cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 ${
                selected === d.id
                  ? 'ring-4 ring-blue-500 shadow-2xl scale-[1.02]'
                  : 'ring-1 ring-border hover:shadow-lg hover:scale-[1.01]'
              }`}
            >
              {/* Header */}
              <div className={`bg-gradient-to-r ${d.color} px-3 py-2 text-white`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">Design {d.id}</span>
                  {selected === d.id && (
                    <span className="bg-white text-blue-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      SELECTED
                    </span>
                  )}
                </div>
                <p className="text-white/80 text-xs">{d.name}</p>
              </div>

              {/* Image */}
              <div className="bg-card p-2 flex justify-center">
                <img
                  src={`/receipt-design-${d.id}.png`}
                  alt={`Design ${d.id}: ${d.name}`}
                  className="w-full max-w-[280px] rounded-lg shadow-md"
                />
              </div>

              {/* Description */}
              <div className="px-3 py-2 bg-muted border-t border-border">
                <p className="text-xs text-muted-foreground">{d.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Selection Result */}
        {selected && (
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-3 bg-primary/10 border-2 border-primary/20 rounded-xl px-6 py-4">
              <span className="text-lg font-bold text-primary">
                Design {selected}: {designs[selected - 1].name}
              </span>
              <span className="text-sm text-primary/70">selected</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Reply with &quot;Design {selected}&quot; to confirm your choice
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
