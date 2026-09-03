/**
 * Descripción declarativa de un overlay.
 *
 * JSON tipado, nunca HTML. El prototipo serializaba `innerHTML` en
 * localStorage y lo reinyectaba al cargar; con nombres de espectadores
 * llegando desde cuatro plataformas eso es inyección directa en pantalla.
 */

export const WIDGET_KINDS = ['alert', 'chat', 'goal', 'timer', 'label', 'image'] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

/** Posición en porcentaje del lienzo, para que escale con la resolución. */
export interface WidgetBox {
  readonly xPercent: number;
  readonly yPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
}

export interface WidgetStyle {
  readonly accentColor?: string;
  readonly fontFamily?: string;
  readonly fontSizePx?: number;
  readonly align?: 'start' | 'center' | 'end';
}

export interface OverlayWidget {
  readonly id: string;
  readonly kind: WidgetKind;
  readonly box: WidgetBox;
  readonly style?: WidgetStyle;
  /** Para `goal`: qué contador sigue. Para `label`: el texto. */
  readonly binding?: string;
  readonly text?: string;
  readonly imageUrl?: string;
  readonly visible: boolean;
}

export interface OverlayLayout {
  readonly id: string;
  readonly name: string;
  readonly widgets: readonly OverlayWidget[];
  readonly version: number;
}

export const DEFAULT_BOX: WidgetBox = {
  xPercent: 30,
  yPercent: 30,
  widthPercent: 40,
  heightPercent: 20,
};

export function emptyLayout(id: string, name: string): OverlayLayout {
  return { id, name, widgets: [], version: 1 };
}

/** Mantiene los widgets dentro del lienzo al arrastrarlos. */
export function clampBox(box: WidgetBox): WidgetBox {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const widthPercent = clamp(box.widthPercent, 5, 100);
  const heightPercent = clamp(box.heightPercent, 3, 100);
  return {
    widthPercent,
    heightPercent,
    xPercent: clamp(box.xPercent, 0, 100 - widthPercent),
    yPercent: clamp(box.yPercent, 0, 100 - heightPercent),
  };
}

export function upsertWidget(layout: OverlayLayout, widget: OverlayWidget): OverlayLayout {
  const exists = layout.widgets.some((w) => w.id === widget.id);
  const widgets = exists
    ? layout.widgets.map((w) => (w.id === widget.id ? widget : w))
    : [...layout.widgets, widget];
  return { ...layout, widgets, version: layout.version + 1 };
}

export function removeWidget(layout: OverlayLayout, widgetId: string): OverlayLayout {
  return {
    ...layout,
    widgets: layout.widgets.filter((w) => w.id !== widgetId),
    version: layout.version + 1,
  };
}
