import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Image as ImageIcon,
  Send,
  Clock,
  Tag as TagIcon,
  X,
  Loader2,
  Trash2,
  ShieldAlert,
  Lock,
  Unlock,
  Ban,
  Pencil,
  Check,
  Search,
  Globe,
  Droplets,
  Sprout,
  Building2,
  HelpCircle,
  Code,
  Link as LinkIcon,
  Bold,
  Italic,
  ChevronUp,
  Plus,
  ArrowLeft,
  Share2,
  Copy,
  Eye,
  SlidersHorizontal,
  Flame,
  Award,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Safe, sanitized markdown parser with syntax-styled code blocks and protocol verification
const parseMarkdown = (text: string) => {
  if (!text) return { __html: "" };
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks: ```python / ```javascript / ```json
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const langLabel = (lang || "code").toLowerCase();
    return `<div class="my-3 rounded-lg overflow-hidden border border-border/70 bg-black/80">
      <div class="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/50 text-[11px] font-mono text-muted-foreground">
        <span>${langLabel}</span>
      </div>
      <pre class="p-3 text-emerald-300 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed"><code>${code.trim()}</code></pre>
    </div>`;
  });

  // Inline code: `code`
  html = html.replace(
    /`([^`]+)`/g,
    "<code class='px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs border border-border/50'>$1</code>"
  );

  // Bold & Italic
  html = html
    .replace(/\*\*(.*?)\*\*/g, "<strong class='font-semibold text-foreground'>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em class='italic text-foreground/90'>$1</em>");

  // Safe Links: only http://, https://, or relative /
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (_match, linkText, url) => {
    const trimmedUrl = url.trim();
    const isSafe = /^https?:\/\//i.test(trimmedUrl) || /^\//.test(trimmedUrl);
    if (!isSafe) {
      return linkText;
    }
    return `<a href='${trimmedUrl}' target='_blank' rel='noopener noreferrer' class='text-sky-400 hover:underline font-medium'>${linkText}</a>`;
  });

  html = html.replace(/\n/g, "<br />");
  return { __html: html };
};

// Parser to extract title and body
const parseThread = (rawContent: string) => {
  if (!rawContent) return { title: "Untitled Discussion", body: "" };
  const trimmed = rawContent.trim();

  // Pattern: # [CATEGORY] Title\n\nBody
  const structuredMatch = trimmed.match(/^#\s*(?:\[.*?\])?\s*(.*?)\n\n([\s\S]*)$/);
  if (structuredMatch) {
    return {
      title: structuredMatch[1].trim(),
      body: structuredMatch[2].trim(),
    };
  }

  // Pattern: # Title\n\nBody
  const headerMatch = trimmed.match(/^#\s*(.*?)\n\n([\s\S]*)$/);
  if (headerMatch) {
    return {
      title: headerMatch[1].trim(),
      body: headerMatch[2].trim(),
    };
  }

  const lines = trimmed.split("\n");
  const firstLine = lines[0].replace(/^#+\s*/, "").trim();
  const rest = lines.slice(1).join("\n").trim();
  return {
    title: firstLine.length > 90 ? firstLine.substring(0, 87) + "..." : firstLine || "Discussion",
    body: rest || trimmed,
  };
};

const CATEGORIES = [
  { id: "All", label: "All Topics", icon: Globe },
  { id: "General", label: "General", icon: Globe },
  { id: "Hydrology", label: "Hydrology & Water", icon: Droplets },
  { id: "Agriculture", label: "Agriculture & Land", icon: Sprout },
  { id: "Urban", label: "Urban & Settlement", icon: Building2 },
  { id: "Support", label: "GEE & Code", icon: HelpCircle },
];

export function CommunityPage() {
  const { user } = useAuth();
  const author = user?.name || "Analyst";

  // Navigation & View States
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortMode, setSortMode] = useState<"newest" | "top" | "discussed">("newest");
  const [tagFilter, setTagFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Composer States
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newTag, setNewTag] = useState("");
  const [composerTab, setComposerTab] = useState<"write" | "preview">("write");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Reply & Edit States
  const [replyContent, setReplyContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  // Queries
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["communityComments", tagFilter, searchQuery, activeCategory],
    queryFn: ({ pageParam = 0 }) =>
      api.community.getComments({
        tag: tagFilter || undefined,
        search: searchQuery || undefined,
        limit: 50,
        offset: pageParam,
        category: activeCategory === "All" ? undefined : activeCategory,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.comments.length < 50) return undefined;
      return allPages.length * 50;
    },
  });

  // WebSocket Live Updates
  useEffect(() => {
    let ws: WebSocket;
    const connectWs = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/^https?:\/\//, "").replace(/\/api$/, "").replace(/\/$/, "")
        : window.location.host;
      const wsUrl = `${protocol}//${wsHost}/api/community/ws`;

      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "new_comment" || msg.type === "upvote") {
            queryClient.invalidateQueries({ queryKey: ["communityComments"] });
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        setTimeout(connectWs, 4000);
      };
    };

    connectWs();
    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [queryClient]);

  const allComments = useMemo(() => {
    return data?.pages.flatMap((page) => page.comments) || [];
  }, [data]);

  // Build hierarchical threads & reply map
  const { threads, repliesMap, activeThread } = useMemo(() => {
    const top = allComments.filter((c) => c.parent_id === null);
    const map = new Map<number, any[]>();
    allComments
      .filter((c) => c.parent_id !== null)
      .forEach((reply) => {
        if (!map.has(reply.parent_id!)) map.set(reply.parent_id!, []);
        map.get(reply.parent_id!)!.push(reply);
      });
    map.forEach((list) =>
      list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    );

    // Apply Sorting
    const sorted = [...top].sort((a, b) => {
      const repliesA = map.get(a.id)?.length || 0;
      const repliesB = map.get(b.id)?.length || 0;
      if (sortMode === "top") return b.upvotes - a.upvotes;
      if (sortMode === "discussed") return repliesB - repliesA;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const active = selectedThreadId ? allComments.find((c) => c.id === selectedThreadId) || null : null;

    return { threads: sorted, repliesMap: map, activeThread: active };
  }, [allComments, selectedThreadId, sortMode]);

  // Extract tags with counts
  const popularTags = useMemo(() => {
    const tagsCount: Record<string, number> = {};
    allComments.forEach((c) => {
      if (c.tag) {
        const t = c.tag.toUpperCase().trim();
        tagsCount[t] = (tagsCount[t] || 0) + 1;
      }
    });
    return Object.entries(tagsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));
  }, [allComments]);

  // Mutations
  const postMutation = useMutation({
    mutationFn: async (vars: { imgUrl?: string; parent_id?: number; content: string; category?: string; tag?: string }) => {
      return api.community.postComment({
        author,
        content: vars.content,
        tag: vars.tag,
        image_url: vars.imgUrl,
        parent_id: vars.parent_id,
        category: vars.category || activeCategory === "All" ? "General" : activeCategory,
      });
    },
    onSuccess: (res: any, vars) => {
      if (!vars.parent_id) {
        setNewTitle("");
        setNewContent("");
        setNewTag("");
        setImageFile(null);
        setIsCreating(false);
        if (res?.id) setSelectedThreadId(res.id);
        toast({ title: "Discussion created" });
      } else {
        setReplyContent("");
        toast({ title: "Reply added" });
      }
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to publish",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.community.deleteComment(id, author),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      if (selectedThreadId) setSelectedThreadId(null);
      toast({ title: "Discussion deleted" });
    },
  });

  const editMutation = useMutation({
    mutationFn: (postData: { id: number; content: string }) =>
      api.community.editComment(postData.id, { author, content: postData.content }),
    onSuccess: () => {
      setEditingCommentId(null);
      setEditContent("");
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "Message updated" });
    },
  });

  const upvoteMutation = useMutation({
    mutationFn: (id: number) => api.community.toggleUpvote(id, author),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
    },
  });

  const freezeMutation = useMutation({
    mutationFn: (frozen: boolean) => api.community.setFreeze(frozen),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "Forum status updated" });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (userAuthor: string) => api.community.unblockUser(userAuthor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "User unblocked" });
    },
  });

  const isFrozen = data?.pages[0]?.is_frozen ?? false;
  const blockedUsers = data?.pages[0]?.blocked_users ?? [];
  const cannotPost = !isAdmin && isFrozen;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cannotPost) return;
    if (!newTitle.trim() || !newContent.trim()) return;

    const formattedPayload = `# ${newTitle.trim()}\n\n${newContent.trim()}`;

    if (imageFile) {
      setUploadingImage(true);
      try {
        const fd = new FormData();
        fd.append("file", imageFile);
        const res = await api.community.uploadImage(fd);
        await postMutation.mutateAsync({
          imgUrl: res.url,
          content: formattedPayload,
          category: newCategory,
          tag: newTag.trim() || undefined,
        });
      } catch (err: any) {
        toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
      } finally {
        setUploadingImage(false);
      }
    } else {
      postMutation.mutate({
        content: formattedPayload,
        category: newCategory,
        tag: newTag.trim() || undefined,
      });
    }
  };

  const handleReplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cannotPost || !selectedThreadId || !replyContent.trim()) return;
    postMutation.mutate({
      parent_id: selectedThreadId,
      content: replyContent.trim(),
    });
  };

  const getInitials = (name: string) => {
    return (
      name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase() || "EO"
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Top Minimalist Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Discussions</h1>
              <span className="text-xs font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/50">
                {threads.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Earth observation analysis, sensor verification, and methodology discourse.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearchQuery(searchInput);
              }}
              className="relative w-full sm:w-56"
            >
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search topics..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 h-8 text-xs bg-muted/30 border-border/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </form>

            <Button
              size="sm"
              onClick={() => {
                setIsCreating(!isCreating);
                if (selectedThreadId) setSelectedThreadId(null);
              }}
              className="h-8 gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Discussion</span>
            </Button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center justify-between gap-4 overflow-x-auto pb-1 no-scrollbar border-b border-border/40">
          <div className="flex items-center gap-1">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    if (selectedThreadId) setSelectedThreadId(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                    isActive
                      ? "bg-muted text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-emerald-500" : "text-muted-foreground"}`} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <span className="text-[11px] text-muted-foreground/70 hidden sm:inline">Sort:</span>
            {[
              { id: "newest", label: "Newest" },
              { id: "top", label: "Top" },
              { id: "discussed", label: "Most Discussed" },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSortMode(s.id as any)}
                className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                  sortMode === s.id ? "bg-muted text-foreground font-medium" : "hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Tag Filter */}
        {tagFilter && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Filtered by tag:</span>
            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono text-[11px]">
              <TagIcon className="w-2.5 h-2.5" />
              {tagFilter}
              <button onClick={() => setTagFilter("")} className="hover:text-emerald-200 ml-1">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        {/* View Mode: Create Discussion Form */}
        {isCreating && (
          <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h2 className="text-sm font-semibold text-foreground">Create New Discussion</h2>
              <button
                onClick={() => setIsCreating(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8">
                  <Input
                    placeholder="Discussion title..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="h-9 text-xs bg-background"
                    required
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-4">
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full h-9 rounded-md bg-background border border-border/70 px-2.5 text-xs text-foreground focus:ring-1 focus:ring-emerald-500"
                  >
                    {CATEGORIES.filter((c) => c.id !== "All").map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Write vs Preview Toggle & Formatting */}
              <div className="flex items-center justify-between border-b border-border/40 pb-2 text-xs">
                <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded">
                  <button
                    type="button"
                    onClick={() => setComposerTab("write")}
                    className={`px-2.5 py-0.5 rounded text-xs transition-colors ${
                      composerTab === "write" ? "bg-card text-foreground font-medium shadow-2xs" : "text-muted-foreground"
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerTab("preview")}
                    className={`px-2.5 py-0.5 rounded text-xs transition-colors ${
                      composerTab === "preview" ? "bg-card text-foreground font-medium shadow-2xs" : "text-muted-foreground"
                    }`}
                  >
                    Preview
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Tag (e.g. S2_SR)"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value.toUpperCase())}
                    className="h-7 text-[11px] font-mono w-28 bg-background"
                  />
                </div>
              </div>

              {composerTab === "write" ? (
                <Textarea
                  placeholder="Share your observation, code, methodology, or inquiry... (Supports Markdown and ```code)"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="min-h-[140px] text-xs font-mono bg-background focus:ring-emerald-500"
                  required
                />
              ) : (
                <div className="min-h-[140px] p-3 rounded-lg border border-border/60 bg-muted/20 text-xs overflow-y-auto">
                  {newContent.trim() ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-xs"
                      dangerouslySetInnerHTML={parseMarkdown(newContent)}
                    />
                  ) : (
                    <span className="text-muted-foreground italic">Nothing to preview</span>
                  )}
                </div>
              )}

              {/* Image Preview */}
              {imageFile && (
                <div className="relative inline-block border rounded p-1 bg-muted/30">
                  <img src={URL.createObjectURL(imageFile)} alt="Attachment" className="h-20 w-auto rounded" />
                  <button
                    type="button"
                    onClick={() => setImageFile(null)}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5 shadow"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <div>
                  <input
                    type="file"
                    id="new-post-img"
                    accept="image/png, image/jpeg"
                    className="hidden"
                    onChange={(e) => e.target.files && setImageFile(e.target.files[0])}
                  />
                  <label htmlFor="new-post-img">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 cursor-pointer text-xs border-border/60"
                      asChild
                    >
                      <span>
                        <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Attach Image</span>
                      </span>
                    </Button>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIsCreating(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={postMutation.isPending || uploadingImage || !newTitle.trim() || !newContent.trim()}
                    className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                  >
                    {postMutation.isPending || uploadingImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Publish Discussion
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* View Mode: Active Thread Detail */}
        {selectedThreadId && activeThread ? (
          <div className="space-y-6 animate-in fade-in duration-150">
            {/* Back button */}
            <button
              onClick={() => setSelectedThreadId(null)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to all discussions</span>
            </button>

            {/* Main Post Container */}
            <div className="border border-border/80 rounded-xl bg-card p-6 shadow-sm space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/50">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                      {activeThread.category}
                    </span>
                    {activeThread.tag && (
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        #{activeThread.tag}
                      </span>
                    )}
                  </div>
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                    {parseThread(activeThread.content).title}
                  </h1>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{activeThread.author}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(activeThread.timestamp.endsWith("Z") ? activeThread.timestamp : activeThread.timestamp + "Z"), { addSuffix: true })}</span>
                  </div>
                </div>

                {/* Upvote Pill */}
                <button
                  onClick={() => upvoteMutation.mutate(activeThread.id)}
                  className={`flex flex-col items-center justify-center min-w-[42px] px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
                    activeThread.upvoted_by?.includes(author)
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                      : "bg-muted/30 text-muted-foreground hover:text-foreground border-border/60 hover:bg-muted"
                  }`}
                  title="Upvote discussion"
                >
                  <ChevronUp className="w-4 h-4" />
                  <span className="font-semibold">{activeThread.upvotes || 0}</span>
                </button>
              </div>

              {/* Main Body */}
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 text-sm leading-relaxed"
                dangerouslySetInnerHTML={parseMarkdown(parseThread(activeThread.content).body)}
              />

              {/* Attached Image */}
              {activeThread.image_url && (
                <div className="pt-2">
                  <img
                    src={activeThread.image_url}
                    alt="Observation Attachment"
                    className="max-h-96 w-auto rounded-lg border border-border/70"
                  />
                </div>
              )}

              {/* Thread Actions */}
              {(isAdmin || activeThread.author === author) && (
                <div className="flex justify-end pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(activeThread.id)}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Discussion
                  </Button>
                </div>
              )}
            </div>

            {/* Replies List */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>Replies</span>
                <span className="text-xs text-muted-foreground font-mono">
                  ({repliesMap.get(activeThread.id)?.length || 0})
                </span>
              </h3>

              <div className="space-y-3">
                {(repliesMap.get(activeThread.id) || []).map((reply) => {
                  const rUtc = reply.timestamp.endsWith("Z") ? reply.timestamp : reply.timestamp + "Z";
                  const isRAuthor = reply.author === author;
                  return (
                    <div key={reply.id} className="border border-border/70 rounded-xl bg-card/60 p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                            {getInitials(reply.author)}
                          </div>
                          <span className="font-semibold text-foreground">{reply.author}</span>
                          <span>•</span>
                          <span>{formatDistanceToNow(new Date(rUtc), { addSuffix: true })}</span>
                        </div>

                        {(isAdmin || isRAuthor) && (
                          <button
                            onClick={() => deleteMutation.mutate(reply.id)}
                            className="text-muted-foreground hover:text-destructive p-1 rounded"
                            title="Delete reply"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground/90"
                        dangerouslySetInnerHTML={parseMarkdown(reply.content)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Add Reply Box */}
              {!cannotPost && (
                <form onSubmit={handleReplySubmit} className="space-y-2 pt-2">
                  <Textarea
                    placeholder="Write a constructive reply..."
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    className="min-h-[80px] text-xs font-mono bg-card"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={postMutation.isPending || !replyContent.trim()}
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                    >
                      {postMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Send className="w-3 h-3 mr-1.5" />}
                      Reply
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* View Mode: High-Density Thread Stream (Option A) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Stream Column */}
            <div className="lg:col-span-8 space-y-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-12 border border-border/50 rounded-xl bg-card/40">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mb-2" />
                  <p className="text-xs text-muted-foreground">Loading discussions...</p>
                </div>
              ) : threads.length === 0 ? (
                <div className="text-center p-12 border border-border/50 rounded-xl bg-card/40 space-y-2">
                  <p className="text-sm font-medium text-foreground">No discussions found</p>
                  <p className="text-xs text-muted-foreground">
                    No discussions match your filter. Be the first to start a conversation in {activeCategory}.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsCreating(true)}
                    className="mt-2 text-xs"
                  >
                    Start a Discussion
                  </Button>
                </div>
              ) : (
                <div className="border border-border/60 rounded-xl bg-card divide-y divide-border/50 overflow-hidden shadow-2xs">
                  {threads.map((thread) => {
                    const parsed = parseThread(thread.content);
                    const replyCount = repliesMap.get(thread.id)?.length || 0;
                    const utc = thread.timestamp.endsWith("Z") ? thread.timestamp : thread.timestamp + "Z";
                    const hasUpvoted = thread.upvoted_by?.includes(author);

                    return (
                      <div
                        key={thread.id}
                        className="flex items-start gap-3 p-3.5 sm:p-4 hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => setSelectedThreadId(thread.id)}
                      >
                        {/* Left: Minimalist Upvote Column */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            upvoteMutation.mutate(thread.id);
                          }}
                          className={`flex flex-col items-center justify-center min-w-[36px] py-1 rounded border text-[11px] font-mono transition-all shrink-0 cursor-pointer ${
                            hasUpvoted
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                              : "bg-muted/20 text-muted-foreground hover:text-foreground border-border/50 hover:bg-muted/50"
                          }`}
                          title="Upvote"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span className="font-semibold">{thread.upvotes || 0}</span>
                        </button>

                        {/* Center: Title & Snippet */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs sm:text-sm text-foreground group-hover:text-emerald-400 transition-colors line-clamp-1">
                              {parsed.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium shrink-0">
                              {thread.category}
                            </span>
                            {thread.tag && (
                              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded shrink-0">
                                #{thread.tag}
                              </span>
                            )}
                          </div>

                          {/* Snippet */}
                          <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                            {parsed.body.replace(/[#*`]/g, "")}
                          </p>

                          {/* Meta */}
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80 pt-0.5">
                            <span className="font-medium text-foreground/80">{thread.author}</span>
                            <span>•</span>
                            <span>{formatDistanceToNow(new Date(utc), { addSuffix: true })}</span>
                            {thread.image_url && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <ImageIcon className="w-3 h-3" /> Image
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right: Comment Count Badge */}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono shrink-0 pt-0.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{replyCount}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {hasNextPage && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
                    Load More
                  </Button>
                </div>
              )}
            </div>

            {/* Sidebar Column */}
            <div className="lg:col-span-4 space-y-5">
              {/* Categories Summary */}
              <div className="border border-border/60 rounded-xl p-4 bg-card/60 space-y-2.5">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Categories
                </h3>
                <div className="space-y-1 text-xs">
                  {CATEGORIES.filter((c) => c.id !== "All").map((cat) => {
                    const count = threads.filter((t) => t.category === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                          activeCategory === cat.id
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span className="text-[11px] font-mono text-muted-foreground">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Popular Tags */}
              {popularTags.length > 0 && (
                <div className="border border-border/60 rounded-xl p-4 bg-card/60 space-y-2.5">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Topics &amp; Tags
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {popularTags.map((t) => (
                      <button
                        key={t.tag}
                        onClick={() => setTagFilter(t.tag === tagFilter ? "" : t.tag)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer border ${
                          tagFilter === t.tag
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold"
                            : "bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        #{t.tag} <span className="opacity-60 text-[10px]">({t.count})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Gate (Only for Admins) */}
              {isAdmin && (
                <div className="border border-border/70 rounded-xl p-4 bg-card/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-foreground">Forum Gate</h3>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                        isFrozen ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {isFrozen ? "FROZEN" : "ACTIVE"}
                    </span>
                  </div>
                  <Button
                    variant={isFrozen ? "default" : "outline"}
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={() => freezeMutation.mutate(!isFrozen)}
                    disabled={freezeMutation.isPending}
                  >
                    {isFrozen ? "Unfreeze Forum" : "Freeze Forum"}
                  </Button>

                  {blockedUsers.length > 0 && (
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-[11px] text-muted-foreground mb-1.5">Blocked Users:</p>
                      <div className="space-y-1">
                        {blockedUsers.map((u: string) => (
                          <div
                            key={u}
                            className="flex items-center justify-between text-xs font-mono bg-muted/40 px-2 py-1 rounded"
                          >
                            <span className="truncate">{u}</span>
                            <button
                              onClick={() => unblockMutation.mutate(u)}
                              className="text-muted-foreground hover:text-foreground text-[10px]"
                            >
                              Unblock
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
