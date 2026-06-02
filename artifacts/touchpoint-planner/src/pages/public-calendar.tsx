import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, ExternalLink, Download, MapPin } from "lucide-react";
import { useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PublicCalendarEvent {
  id: number;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  locationLabel: string | null;
  status: string;
  updatedAt: string;
}

interface PublicCalendarPayload {
  calendar: {
    id: number;
    name: string;
    description: string | null;
    timezone: string;
    color: string | null;
    publicSlug: string | null;
    updatedAt: string;
  };
  events: PublicCalendarEvent[];
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: PublicCalendarPayload };

function setNoindexMeta() {
  const existing = document.querySelector<HTMLMetaElement>(
    'meta[name="robots"]',
  );
  const meta = existing ?? document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex,nofollow";
  if (!existing) document.head.appendChild(meta);
}

function formatEventDate(event: PublicCalendarEvent): string {
  const start = parseISO(event.startsAt);
  const end = parseISO(event.endsAt);
  if (event.allDay) return format(start, "MMMM d, yyyy");
  return `${format(start, "MMMM d, yyyy h:mm a")} – ${format(end, "h:mm a")}`;
}

export default function PublicCalendarPage() {
  const [, params] = useRoute("/public/calendars/:slug");
  const slug = params?.slug ?? "";
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const icsUrl = useMemo(() => `/api/public/calendars/${slug}.ics`, [slug]);
  const googleSubscribeUrl = useMemo(() => {
    if (typeof window === "undefined") return "#";
    const absoluteFeedUrl = new URL(icsUrl, window.location.origin).toString();
    return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(absoluteFeedUrl)}`;
  }, [icsUrl]);

  useEffect(() => {
    setNoindexMeta();
  }, []);

  useEffect(() => {
    let canceled = false;
    async function loadCalendar() {
      setState({ status: "loading" });
      try {
        const response = await fetch(`/api/public/calendars/${slug}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          setState({
            status: "error",
            message:
              response.status === 404
                ? "Calendar not found."
                : "Could not load this calendar.",
          });
          return;
        }
        const data = (await response.json()) as PublicCalendarPayload;
        if (!canceled) {
          document.title = `${data.calendar.name} · Public Calendar`;
          setState({ status: "loaded", data });
        }
      } catch {
        if (!canceled) {
          setState({
            status: "error",
            message: "Could not load this calendar.",
          });
        }
      }
    }
    if (slug) void loadCalendar();
    return () => {
      canceled = true;
    };
  }, [slug]);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Badge variant="outline" className="w-fit gap-2">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  Public operational calendar
                </Badge>
                <CardTitle className="text-3xl">
                  {state.status === "loaded"
                    ? state.data.calendar.name
                    : "Public calendar"}
                </CardTitle>
                {state.status === "loaded" &&
                state.data.calendar.description ? (
                  <CardDescription>
                    {state.data.calendar.description}
                  </CardDescription>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={icsUrl}>
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Download ICS
                  </a>
                </Button>
                <Button asChild size="sm">
                  <a href={googleSubscribeUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    Google Calendar
                  </a>
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {state.status === "loading" ? (
          <Card>
            <CardContent
              className="py-10 text-center text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Loading calendar…
            </CardContent>
          </Card>
        ) : null}

        {state.status === "error" ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {state.message}
            </CardContent>
          </Card>
        ) : null}

        {state.status === "loaded" ? (
          <section className="space-y-3" aria-label="Calendar events">
            {state.data.events.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No upcoming public events are listed for this calendar.
                </CardContent>
              </Card>
            ) : (
              state.data.events.map((event) => (
                <Card key={event.id}>
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="text-xl">{event.title}</CardTitle>
                        <CardDescription>
                          {formatEventDate(event)}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">{event.status}</Badge>
                    </div>
                  </CardHeader>
                  {event.description || event.locationLabel ? (
                    <CardContent className="space-y-3 text-sm">
                      {event.description ? (
                        <p className="whitespace-pre-wrap">
                          {event.description}
                        </p>
                      ) : null}
                      {event.locationLabel ? (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4" aria-hidden="true" />
                          {event.locationLabel}
                        </p>
                      ) : null}
                    </CardContent>
                  ) : null}
                </Card>
              ))
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
