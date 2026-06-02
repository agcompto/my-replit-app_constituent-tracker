import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Copy,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface OperationalCalendar {
  id: number;
  name: string;
  description: string | null;
  ownerUserId: number;
  timezone: string;
  visibility: "private" | "public";
  color: string | null;
  publicSlug: string | null;
  publicEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface OperationalCalendarEvent {
  id: number;
  calendarId: number;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string;
  locationLabel: string | null;
  status: "draft" | "scheduled" | "canceled" | "completed";
  visibility: "inherit" | "private" | "public";
}

type CalendarForm = {
  name: string;
  description: string;
  visibility: "private" | "public";
  publicSlug: string;
  publicEnabled: boolean;
};

type EventForm = {
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
  locationLabel: string;
  visibility: "inherit" | "private" | "public";
  status: "draft" | "scheduled" | "canceled" | "completed";
};

const defaultCalendarForm: CalendarForm = {
  name: "",
  description: "",
  visibility: "private",
  publicSlug: "",
  publicEnabled: false,
};

const defaultEventForm: EventForm = {
  title: "",
  startsAt: "",
  endsAt: "",
  description: "",
  locationLabel: "",
  visibility: "inherit",
  status: "scheduled",
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function CalendarPublishingPanel() {
  const { toast } = useToast();
  const [calendars, setCalendars] = useState<OperationalCalendar[]>([]);
  const [events, setEvents] = useState<OperationalCalendarEvent[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<number | null>(
    null,
  );
  const [calendarForm, setCalendarForm] =
    useState<CalendarForm>(defaultCalendarForm);
  const [eventForm, setEventForm] = useState<EventForm>(defaultEventForm);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCalendar = useMemo(
    () =>
      calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null,
    [calendars, selectedCalendarId],
  );

  const publicUrl = useMemo(() => {
    if (!selectedCalendar?.publicSlug) return null;
    return `/public/calendars/${selectedCalendar.publicSlug}`;
  }, [selectedCalendar]);

  const publicIcsUrl = useMemo(() => {
    if (!selectedCalendar?.publicSlug) return null;
    return `/api/public/calendars/${selectedCalendar.publicSlug}.ics`;
  }, [selectedCalendar]);

  const googleSubscribeUrl = useMemo(() => {
    const sourceUrl = feedUrl ?? publicIcsUrl;
    if (!sourceUrl || typeof window === "undefined") return null;
    const absolute = new URL(sourceUrl, window.location.origin).toString();
    return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(absolute)}`;
  }, [feedUrl, publicIcsUrl]);

  const loadCalendars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiJson<OperationalCalendar[]>("/api/calendars");
      setCalendars(rows);
      setSelectedCalendarId((current) => current ?? rows[0]?.id ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load calendars.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async (calendarId: number) => {
    try {
      const rows = await apiJson<OperationalCalendarEvent[]>(
        `/api/calendars/${calendarId}/events`,
      );
      setEvents(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load calendar events.",
      );
    }
  }, []);

  useEffect(() => {
    void loadCalendars();
  }, [loadCalendars]);

  useEffect(() => {
    if (selectedCalendar) {
      setCalendarForm({
        name: selectedCalendar.name,
        description: selectedCalendar.description ?? "",
        visibility: selectedCalendar.visibility,
        publicSlug: selectedCalendar.publicSlug ?? "",
        publicEnabled: selectedCalendar.publicEnabled,
      });
      setFeedUrl(null);
      void loadEvents(selectedCalendar.id);
    } else {
      setEvents([]);
      setCalendarForm(defaultCalendarForm);
    }
  }, [loadEvents, selectedCalendar]);

  async function createCalendar() {
    const name = calendarForm.name.trim();
    if (!name) {
      toast({ title: "Calendar name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const row = await apiJson<OperationalCalendar>("/api/calendars", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: calendarForm.description.trim() || null,
          timezone: "America/New_York",
          visibility: calendarForm.visibility,
          publicSlug: calendarForm.publicSlug.trim() || null,
          publicEnabled: calendarForm.publicEnabled,
        }),
      });
      toast({ title: "Calendar created" });
      await loadCalendars();
      setSelectedCalendarId(row.id);
    } catch (err) {
      toast({
        title: "Could not create calendar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveCalendar() {
    if (!selectedCalendar) return;
    setSaving(true);
    try {
      const row = await apiJson<OperationalCalendar>(
        `/api/calendars/${selectedCalendar.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: calendarForm.name.trim(),
            description: calendarForm.description.trim() || null,
            timezone: selectedCalendar.timezone,
            visibility: calendarForm.visibility,
            publicSlug: calendarForm.publicSlug.trim() || null,
            publicEnabled: calendarForm.publicEnabled,
          }),
        },
      );
      setCalendars((items) =>
        items.map((item) => (item.id === row.id ? row : item)),
      );
      toast({ title: "Calendar updated" });
    } catch (err) {
      toast({
        title: "Could not update calendar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function archiveCalendar() {
    if (!selectedCalendar) return;
    setSaving(true);
    try {
      await apiJson<void>(`/api/calendars/${selectedCalendar.id}`, {
        method: "DELETE",
      });
      toast({ title: "Calendar archived" });
      setSelectedCalendarId(null);
      await loadCalendars();
    } catch (err) {
      toast({
        title: "Could not archive calendar",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function createEvent() {
    if (!selectedCalendar) return;
    if (!eventForm.title.trim() || !eventForm.startsAt || !eventForm.endsAt) {
      toast({
        title: "Event title, start, and end are required",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const row = await apiJson<OperationalCalendarEvent>(
        `/api/calendars/${selectedCalendar.id}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            title: eventForm.title.trim(),
            description: eventForm.description.trim() || null,
            startsAt: toIso(eventForm.startsAt),
            endsAt: toIso(eventForm.endsAt),
            allDay: false,
            timezone: selectedCalendar.timezone,
            locationLabel: eventForm.locationLabel.trim() || null,
            visibility: eventForm.visibility,
            status: eventForm.status,
          }),
        },
      );
      setEvents((items) =>
        [...items, row].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      setEventForm(defaultEventForm);
      toast({ title: "Calendar event created" });
    } catch (err) {
      toast({
        title: "Could not create event",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(event: OperationalCalendarEvent) {
    setSaving(true);
    try {
      await apiJson<void>(`/api/calendar-events/${event.id}`, {
        method: "DELETE",
      });
      setEvents((items) => items.filter((item) => item.id !== event.id));
      toast({ title: "Calendar event removed" });
    } catch (err) {
      toast({
        title: "Could not remove event",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function regenerateFeedToken() {
    if (!selectedCalendar) return;
    setSaving(true);
    try {
      const response = await apiJson<{ feedUrl: string }>(
        `/api/calendars/${selectedCalendar.id}/feed-token`,
        {
          method: "POST",
        },
      );
      setFeedUrl(response.feedUrl);
      toast({
        title: "Feed token regenerated",
        description:
          "Copy this feed URL now; the raw token is only returned once.",
      });
    } catch (err) {
      toast({
        title: "Could not regenerate feed token",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(
      new URL(value, window.location.origin).toString(),
    );
    toast({ title: `${label} copied` });
  }

  return (
    <Card className="m-4 border-primary/20 print:hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Calendar publishing
            </CardTitle>
            <CardDescription>
              Manage operational calendars, public sharing, ICS feeds, and
              scheduled events.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {publicUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                  Public page
                </a>
              </Button>
            ) : null}
            {publicIcsUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={publicIcsUrl}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Public ICS
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(360px,1.2fr)]">
        <div className="space-y-3">
          <Label htmlFor="calendar-selector">Calendar</Label>
          <Select
            value={selectedCalendarId ? String(selectedCalendarId) : "__none__"}
            onValueChange={(value) =>
              setSelectedCalendarId(value === "__none__" ? null : Number(value))
            }
          >
            <SelectTrigger id="calendar-selector">
              <SelectValue
                placeholder={
                  loading ? "Loading calendars…" : "Select a calendar"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">New calendar</SelectItem>
              {calendars.map((calendar) => (
                <SelectItem key={calendar.id} value={String(calendar.id)}>
                  {calendar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="grid gap-3 rounded-lg border p-3">
            <div className="grid gap-2">
              <Label htmlFor="calendar-name">Name</Label>
              <Input
                id="calendar-name"
                value={calendarForm.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setCalendarForm((form) => ({
                    ...form,
                    name,
                    publicSlug: form.publicSlug || slugify(name),
                  }));
                }}
                placeholder="Advancement operations calendar"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calendar-description">Description</Label>
              <Textarea
                id="calendar-description"
                value={calendarForm.description}
                onChange={(event) =>
                  setCalendarForm((form) => ({
                    ...form,
                    description: event.target.value,
                  }))
                }
                placeholder="Internal planning and public operational visibility."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="calendar-visibility">Visibility</Label>
                <Select
                  value={calendarForm.visibility}
                  onValueChange={(value) =>
                    setCalendarForm((form) => ({
                      ...form,
                      visibility: value as "private" | "public",
                    }))
                  }
                >
                  <SelectTrigger id="calendar-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="calendar-slug">Public slug</Label>
                <Input
                  id="calendar-slug"
                  value={calendarForm.publicSlug}
                  onChange={(event) =>
                    setCalendarForm((form) => ({
                      ...form,
                      publicSlug: slugify(event.target.value),
                    }))
                  }
                  placeholder="operations-calendar"
                />
              </div>
            </div>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={calendarForm.publicEnabled}
                onCheckedChange={(checked) =>
                  setCalendarForm((form) => ({
                    ...form,
                    publicEnabled: checked === true,
                  }))
                }
              />
              Enable public page and public ICS feed
            </Label>
            <div className="flex flex-wrap gap-2">
              {selectedCalendar ? (
                <>
                  <Button size="sm" onClick={saveCalendar} disabled={saving}>
                    Save calendar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={regenerateFeedToken}
                    disabled={saving}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Regenerate feed token
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={archiveCalendar}
                    disabled={saving}
                  >
                    Archive
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={createCalendar}
                  disabled={saving || loading}
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Create calendar
                </Button>
              )}
            </div>
            {feedUrl ? (
              <div className="rounded-md bg-muted p-2 text-xs">
                <p className="mb-2 font-medium">
                  Tokenized ICS feed URL — copy now
                </p>
                <div className="flex flex-wrap gap-2">
                  <code className="break-all rounded bg-background px-2 py-1">
                    {feedUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(feedUrl, "Feed URL")}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    Copy
                  </Button>
                  {googleSubscribeUrl ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={googleSubscribeUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Google
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">
                  Schedule an operational event
                </h3>
                <p className="text-xs text-muted-foreground">
                  Events are internal by default unless marked public/inherited
                  on a public calendar.
                </p>
              </div>
              {selectedCalendar ? (
                <Badge variant="outline">{selectedCalendar.timezone}</Badge>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  value={eventForm.title}
                  onChange={(event) =>
                    setEventForm((form) => ({
                      ...form,
                      title: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-start">Starts</Label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  value={eventForm.startsAt}
                  onChange={(event) =>
                    setEventForm((form) => ({
                      ...form,
                      startsAt: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-end">Ends</Label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  value={eventForm.endsAt}
                  onChange={(event) =>
                    setEventForm((form) => ({
                      ...form,
                      endsAt: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-visibility">Visibility</Label>
                <Select
                  value={eventForm.visibility}
                  onValueChange={(value) =>
                    setEventForm((form) => ({
                      ...form,
                      visibility: value as "inherit" | "private" | "public",
                    }))
                  }
                >
                  <SelectTrigger id="event-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Inherit calendar</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="event-status">Status</Label>
                <Select
                  value={eventForm.status}
                  onValueChange={(value) =>
                    setEventForm((form) => ({
                      ...form,
                      status: value as
                        | "draft"
                        | "scheduled"
                        | "canceled"
                        | "completed",
                    }))
                  }
                >
                  <SelectTrigger id="event-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="event-location">Location</Label>
                <Input
                  id="event-location"
                  value={eventForm.locationLabel}
                  onChange={(event) =>
                    setEventForm((form) => ({
                      ...form,
                      locationLabel: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="event-description">Description</Label>
                <Textarea
                  id="event-description"
                  value={eventForm.description}
                  onChange={(event) =>
                    setEventForm((form) => ({
                      ...form,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <Button
              size="sm"
              className="w-fit"
              onClick={createEvent}
              disabled={!selectedCalendar || saving}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add event
            </Button>
          </div>

          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-sm font-medium">
              Calendar events
            </div>
            <div className="max-h-72 overflow-auto">
              {events.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No operational events have been scheduled on this calendar.
                </p>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start justify-between gap-3 border-b p-3 last:border-b-0"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">{event.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(parseISO(event.startsAt), "MMM d, yyyy h:mm a")}{" "}
                        – {format(parseISO(event.endsAt), "h:mm a")}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">{event.status}</Badge>
                        <Badge variant="outline">{event.visibility}</Badge>
                        {event.locationLabel ? (
                          <Badge variant="outline">{event.locationLabel}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteEvent(event)}
                      aria-label={`Remove ${event.title}`}
                      disabled={saving}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
