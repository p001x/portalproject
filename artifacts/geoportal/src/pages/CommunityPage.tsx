import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Image as ImageIcon, Send, Clock, Tag as TagIcon, X, Loader2, Trash2, ShieldAlert, Lock, Unlock, Ban, Pencil, Check, ThumbsUp, Search, Reply, Bell, Hash, UserCircle, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import generalIcon from "@/assets/icons/general.png";
import hydrologyIcon from "@/assets/icons/hydrology.png";
import agricultureIcon from "@/assets/icons/agriculture.png";
import urbanIcon from "@/assets/icons/urban.png";
import supportIcon from "@/assets/icons/support.png";

const parseMarkdown = (text: string) => {
  if (!text) return { __html: "" };
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\[(.*?)\]\((.*?)\)/g, "<a href='$2' target='_blank' rel='noopener noreferrer' class='text-emerald-600 hover:underline'>$1</a>")
    .replace(/\n/g, "<br />");
  return { __html: html };
};

export function CommunityPage() {
  const { user } = useAuth();
  
  // Lock author to the authenticated user's name
  const author = user?.name || "Anonymous Analyst";

  const [content, setContent] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  const [activeCategory, setActiveCategory] = useState("General");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileAuthor, setSelectedProfileAuthor] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  const { toast } = useToast();
  
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["communityComments", tagFilter, searchQuery, activeCategory],
    queryFn: ({ pageParam = 0 }) => api.community.getComments({ tag: tagFilter, search: searchQuery, limit: 50, offset: pageParam, category: activeCategory }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // If we got fewer than 50 comments back, we are at the end
      if (lastPage.comments.length < 50) return undefined;
      return allPages.length * 50; // offset for next page
    },
    // No polling interval, using WebSockets instead
  });

  const { data: notificationsData } = useQuery({
    queryKey: ["communityNotifications", author],
    queryFn: () => api.community.getNotifications(author),
    enabled: !!author,
  });

  const { data: selectedProfile } = useQuery({
    queryKey: ["communityProfile", selectedProfileAuthor],
    queryFn: () => selectedProfileAuthor ? api.community.getProfile(selectedProfileAuthor) : null,
    enabled: !!selectedProfileAuthor,
  });

  useEffect(() => {
    let ws: WebSocket;
    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = import.meta.env.PROD 
        ? `${protocol}//geoportal-api-ygzi.onrender.com/api/community/ws`
        : `${protocol}//localhost:8000/api/community/ws`;
      
      ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'new_comment' || msg.type === 'upvote') {
            queryClient.invalidateQueries({ queryKey: ["communityComments"] });
            queryClient.invalidateQueries({ queryKey: ["communityNotifications", author] });
          }
        } catch (e) {}
      };
      
      ws.onclose = () => {
        setTimeout(connectWs, 3000);
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
    return data?.pages.flatMap(page => page.comments) || [];
  }, [data]);

  // Build threads
  const { topLevelComments, repliesMap } = useMemo(() => {
    const top = allComments.filter(c => c.parent_id === null);
    const map = new Map<number, any[]>();
    allComments.filter(c => c.parent_id !== null).forEach(reply => {
      if (!map.has(reply.parent_id!)) map.set(reply.parent_id!, []);
      map.get(reply.parent_id!)!.push(reply);
    });
    // Sort replies oldest to newest
    map.forEach(list => list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
    return { topLevelComments: top, repliesMap: map };
  }, [allComments]);

  // Extract popular tags
  const popularTags = useMemo(() => {
    const tagsCount: Record<string, number> = {};
    allComments.forEach(c => {
      if (c.tag) {
        const t = c.tag.toUpperCase();
        tagsCount[t] = (tagsCount[t] || 0) + 1;
      }
    });
    return Object.entries(tagsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(entry => entry[0]);
  }, [allComments]);

  const postMutation = useMutation({
    mutationFn: async (vars: { imgUrl?: string, parent_id?: number, content: string }) => {
      return api.community.postComment({
        author,
        content: vars.content,
        tag: !vars.parent_id ? (tagFilter || undefined) : undefined,
        image_url: vars.imgUrl,
        parent_id: vars.parent_id,
        category: activeCategory
      });
    },
    onSuccess: () => {
      setContent("");
      setImageFile(null);
      setReplyContent("");
      setReplyingToId(null);
      setIsComposing(false);
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "Posted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to post",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.community.deleteComment(id, author),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "Message deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete",
        description: error.message || "You cannot delete this message.",
        variant: "destructive"
      });
    }
  });

  const freezeMutation = useMutation({
    mutationFn: (frozen: boolean) => api.community.setFreeze(frozen),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "Forum settings updated" });
    }
  });

  const blockMutation = useMutation({
    mutationFn: (author: string) => api.community.blockUser(author),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "User blocked" });
    }
  });

  const unblockMutation = useMutation({
    mutationFn: (author: string) => api.community.unblockUser(author),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "User unblocked" });
    }
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: number, content: string }) => api.community.editComment(data.id, { author, content: data.content }),
    onSuccess: () => {
      setEditingCommentId(null);
      setEditContent("");
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "Message updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const upvoteMutation = useMutation({
    mutationFn: (id: number) => api.community.toggleUpvote(id, author),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to upvote",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const isFrozen = data?.pages[0]?.is_frozen ?? false;
  const blockedUsers = data?.pages[0]?.blocked_users ?? [];
  const cannotPost = (!isAdmin && isFrozen);

  const handleSubmit = async (e: React.FormEvent, parentId?: number) => {
    e.preventDefault();
    if (cannotPost) return;
    const txt = parentId ? replyContent : content;
    if (!txt.trim()) return;

    if (!parentId && imageFile) {
      setUploadingImage(true);
      try {
        const fd = new FormData();
        fd.append("file", imageFile);
        const res = await api.community.uploadImage(fd);
        await postMutation.mutateAsync({ imgUrl: res.url, parent_id: parentId, content: txt });
      } catch (err: any) {
        toast({
          title: "Image Upload Failed",
          description: err.message || "Failed to process image securely.",
          variant: "destructive"
        });
      } finally {
        setUploadingImage(false);
      }
    } else {
      postMutation.mutate({ parent_id: parentId, content: txt });
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  };

  const renderComment = (comment: any, isReply: boolean = false) => {
    const utcTime = comment.timestamp.endsWith('Z') ? comment.timestamp : comment.timestamp + 'Z';
    const isAuthor = comment.author === author;
    const isEditable = isAuthor && (Date.now() - new Date(utcTime).getTime()) < 15 * 60 * 1000;
    const isEditing = editingCommentId === comment.id;
    const hasUpvoted = comment.upvoted_by?.includes(author);

    return (
      <div key={comment.id} className={`bg-card border rounded-2xl p-5 shadow-sm transition-all ${isEditing ? 'ring-2 ring-emerald-500 border-emerald-500' : 'hover:shadow-md'} ${isReply ? 'ml-8 md:ml-12 border-l-4 border-l-emerald-200' : ''}`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { setSelectedProfileAuthor(comment.author); setShowProfileModal(true); }}
              className={`w-10 h-10 ${isReply ? 'w-8 h-8 text-xs' : ''} bg-emerald-100 text-emerald-700 font-bold rounded-full flex items-center justify-center shadow-inner shrink-0 hover:ring-2 hover:ring-emerald-400 cursor-pointer transition-all`}
              title="View Profile"
            >
              {getInitials(comment.author)}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground text-sm">{comment.author}</span>
                {!isReply && comment.tag && (
                  <button onClick={() => setTagFilter(comment.tag)} className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors cursor-pointer">
                    <TagIcon className="w-3 h-3" /> {comment.tag}
                  </button>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(utcTime), { addSuffix: true })}
                {comment.is_edited && <span className="ml-1 italic opacity-70">(edited)</span>}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={() => upvoteMutation.mutate(comment.id)} 
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${hasUpvoted ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-muted text-muted-foreground'}`}
            >
              <ThumbsUp className={`w-4 h-4 ${hasUpvoted ? 'fill-emerald-700' : ''}`} />
              {comment.upvotes > 0 ? comment.upvotes : ''}
            </button>
            {!isReply && !isEditing && (
              <button onClick={() => setReplyingToId(replyingToId === comment.id ? null : comment.id)} className="p-1.5 hover:bg-muted text-muted-foreground rounded-md transition-colors" title="Reply">
                <Reply className="w-4 h-4" />
              </button>
            )}
            {isEditable && !isEditing && (
              <button 
                onClick={() => {
                  setEditingCommentId(comment.id);
                  setEditContent(comment.content);
                }} 
                className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-md transition-colors" 
                title="Edit Message (within 15m)"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {(isAdmin || isAuthor) && (
              <button onClick={() => deleteMutation.mutate(comment.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-md transition-colors" title="Delete Comment">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {isAdmin && (
              <button onClick={() => blockMutation.mutate(comment.author)} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-md transition-colors" title="Block User">
                <Ban className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        {isEditing ? (
          <div className="space-y-3 mt-2 bg-muted/30 p-3 rounded-xl border">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px] bg-background focus:ring-emerald-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditingCommentId(null)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => editMutation.mutate({ id: comment.id, content: editContent })} disabled={editMutation.isPending || !editContent.trim() || editContent === comment.content}>
                {editMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Save
              </Button>
            </div>
          </div>
        ) : (
          <div 
            className="prose prose-sm md:prose-base prose-emerald max-w-none text-foreground/90 whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={parseMarkdown(comment.content)}
          />
        )}
        
        {comment.image_url && (
          <div className="mt-4 rounded-xl overflow-hidden border inline-block">
            <img src={comment.image_url} alt="Attached" className="max-h-80 w-auto object-contain bg-muted/20" />
          </div>
        )}

        {/* Reply Composer */}
        {replyingToId === comment.id && !cannotPost && (
          <form onSubmit={(e) => handleSubmit(e, comment.id)} className="mt-4 flex gap-3">
            <div className="w-8 h-8 bg-emerald-100 text-emerald-700 font-bold rounded-full flex items-center justify-center shrink-0 text-xs mt-1">
              {getInitials(author)}
            </div>
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder="Write a reply... (Markdown supported)"
                value={replyContent}
                onChange={e => setReplyContent(e.target.value)}
                className="min-h-[80px] text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setReplyingToId(null)}>Cancel</Button>
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={postMutation.isPending || !replyContent.trim()}>
                  {postMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Reply className="w-4 h-4 mr-2" />} Reply
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Professional Header Banner */}
      <section className="relative overflow-hidden bg-muted/30 pt-16 pb-12 px-6 border-b">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 pointer-events-none" />
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border border-emerald-500/20">
              <MessageSquare className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
                Community <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">Forum</span>
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
                Discuss analysis results, share insights, and ask questions safely.
              </p>
            </div>
          </div>
          
          <div className="w-full md:w-auto flex items-center gap-4">
            <form onSubmit={handleSearch} className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search discussions..." 
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="pl-9 bg-background/80 backdrop-blur"
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchInput(""); setSearchQuery(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>

            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 bg-background/80 backdrop-blur border rounded-full hover:bg-background transition relative"
              >
                <Bell className="w-5 h-5 text-foreground" />
                {notificationsData?.notifications?.filter((n: any) => !n.read).length > 0 && (
                  <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-background rounded-full"></span>
                )}
              </button>
              
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-background border rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="p-3 border-b flex justify-between items-center bg-muted/30">
                    <h3 className="font-bold text-sm">Notifications</h3>
                    <button 
                      onClick={async () => {
                        await api.community.markNotificationsRead(author);
                        queryClient.invalidateQueries({ queryKey: ["communityNotifications"] });
                      }}
                      className="text-xs text-emerald-600 hover:underline"
                    >
                      Mark all as read
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {!notificationsData?.notifications?.length ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">No notifications.</div>
                    ) : (
                      notificationsData.notifications.map((n: any) => (
                        <div key={n.id} className={`p-3 border-b text-sm flex gap-3 ${!n.read ? 'bg-emerald-50/50' : ''}`}>
                          <div className="mt-1">
                            {n.type === 'reply' ? <Reply className="w-4 h-4 text-blue-500" /> : <ThumbsUp className="w-4 h-4 text-emerald-500" />}
                          </div>
                          <div>
                            <p><span className="font-semibold">{n.sender}</span> {n.type === 'reply' ? 'replied to your comment.' : 'upvoted your comment.'}</p>
                            <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(n.timestamp + 'Z'), { addSuffix: true })}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <button 
              onClick={() => { setSelectedProfileAuthor(author); setShowProfileModal(true); }}
              className="w-10 h-10 bg-emerald-600 text-white font-bold rounded-full flex items-center justify-center shadow-md hover:bg-emerald-700 transition"
              title="My Profile"
            >
              {getInitials(author)}
            </button>
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Horizontal Channels Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 hide-scrollbar">
          {[
            { id: 'General', icon: generalIcon },
            { id: 'Hydrology', icon: hydrologyIcon },
            { id: 'Agriculture', icon: agricultureIcon },
            { id: 'Urban', icon: urbanIcon },
            { id: 'Support', icon: supportIcon }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${activeCategory === cat.id ? 'bg-emerald-600 text-white shadow-md' : 'bg-card border text-foreground hover:bg-muted'}`}
            >
              {cat.icon ? (
                <img src={cat.icon} alt={cat.id} className="w-5 h-5 object-contain" />
              ) : (
                <Hash className="w-4 h-4 opacity-70" />
              )}
              {cat.id}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-8 space-y-6">
          
          {/* Post Creation Form */}
          <div className="bg-card border rounded-2xl shadow-sm p-4 sm:p-6 relative overflow-hidden transition-all duration-300">
            {cannotPost && (
              <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-[2px] flex items-center justify-center p-6 text-center">
                <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-4 shadow-lg max-w-md">
                  <Lock className="w-6 h-6 mx-auto mb-2 text-amber-600" />
                  <p className="font-semibold">Forum Frozen</p>
                  <p className="text-sm mt-1">An administrator has temporarily frozen the forum. No new comments can be posted.</p>
                </div>
              </div>
            )}
            
            {!isComposing ? (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-700 font-bold rounded-full flex items-center justify-center shrink-0">
                  {getInitials(author)}
                </div>
                <Input 
                  placeholder="What's on your mind? Share your insights..."
                  className="bg-muted/50 border-border/50 cursor-pointer h-12 rounded-full px-5 text-base shadow-inner"
                  onClick={() => setIsComposing(true)}
                  readOnly
                />
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Pencil className="w-5 h-5 text-emerald-500" /> Start a Discussion
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Markdown Supported</span>
                    <button onClick={() => setIsComposing(false)} className="text-muted-foreground hover:bg-muted p-1 rounded-full"><X className="w-5 h-5"/></button>
                  </div>
                </div>
                
                <form onSubmit={(e) => handleSubmit(e)} className="space-y-4">
                  <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-lg border border-border/50">
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-700 font-bold rounded-full flex items-center justify-center shrink-0 text-xs">
                      {getInitials(author)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">Posting in <span className="text-emerald-600">{activeCategory}</span> as {author}</p>
                    </div>
                    {/* Active Tag Filter Indicator */}
                    <div className="w-1/3">
                      {tagFilter ? (
                        <div className="flex items-center justify-between bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-md">
                          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider truncate"><TagIcon className="w-3 h-3 inline mr-1" /> {tagFilter}</span>
                          <button type="button" onClick={() => setTagFilter("")} className="text-emerald-600 hover:text-emerald-800"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <Input 
                          placeholder="Optional Tag (e.g. Drought)" 
                          onChange={e => setTagFilter(e.target.value.toUpperCase())} 
                          disabled={cannotPost}
                          className="h-8 text-sm bg-background"
                        />
                      )}
                    </div>
                  </div>
                  
                  <Textarea 
                    placeholder="Write your message here... You can use **bold**, *italics*, or bullet points!" 
                    value={content} 
                    onChange={e => setContent(e.target.value)} 
                    className="min-h-[120px] resize-y focus:ring-emerald-500"
                    disabled={cannotPost}
                    autoFocus
                    required
                  />

                  {imageFile && (
                    <div className="relative inline-block border rounded-lg p-2 bg-muted/20">
                      <img src={URL.createObjectURL(imageFile)} alt="Preview" className="h-24 w-auto rounded border shadow-sm" />
                      <button 
                        type="button" 
                        onClick={() => setImageFile(null)}
                        className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <input 
                        type="file" 
                        id="image-upload" 
                        accept="image/png, image/jpeg" 
                        className="hidden" 
                        onChange={e => e.target.files && setImageFile(e.target.files[0])}
                        disabled={cannotPost}
                      />
                      <label htmlFor="image-upload">
                        <Button type="button" variant="outline" size="sm" className="gap-2 cursor-pointer hover:bg-muted shadow-sm" disabled={cannotPost} asChild>
                          <span><ImageIcon className="w-4 h-4 text-emerald-600" /> Attach Image</span>
                        </Button>
                      </label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setIsComposing(false)}>Cancel</Button>
                      <Button type="submit" disabled={cannotPost || postMutation.isPending || uploadingImage || !content.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-md">
                        {postMutation.isPending || uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {uploadingImage ? "Processing..." : "Post Message"}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Active Filters Bar */}
          {(tagFilter || searchQuery) && (
            <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-xl border">
              <span className="text-sm text-muted-foreground font-medium">Filtering by:</span>
              {searchQuery && (
                <div className="bg-white border rounded-full px-3 py-1 flex items-center gap-2 text-sm shadow-sm">
                  <Search className="w-3 h-3 text-emerald-600" />
                  "{searchQuery}"
                  <button onClick={() => { setSearchQuery(""); setSearchInput(""); }} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                </div>
              )}
              {tagFilter && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full px-3 py-1 flex items-center gap-2 text-sm shadow-sm font-semibold uppercase tracking-wide">
                  <TagIcon className="w-3 h-3" />
                  {tagFilter}
                  <button onClick={() => setTagFilter("")} className="text-emerald-400 hover:text-emerald-700"><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-16 bg-card border rounded-2xl">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-4" />
                <p className="text-muted-foreground font-medium">Loading discussions...</p>
              </div>
            ) : topLevelComments.length === 0 ? (
              <div className="text-center p-16 border rounded-2xl bg-card flex flex-col items-center shadow-sm">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-bold">No discussions found</h3>
                <p className="text-muted-foreground mt-1 max-w-sm">Try adjusting your filters or be the first to start a conversation.</p>
              </div>
            ) : (
              topLevelComments.map((comment: any) => (
                <div key={comment.id} className="space-y-3">
                  {renderComment(comment)}
                  
                  {/* Nested Replies */}
                  {repliesMap.has(comment.id) && (
                    <div className="space-y-3 pt-2">
                      {repliesMap.get(comment.id)!.map(reply => renderComment(reply, true))}
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Load More Button */}
            {hasNextPage && (
              <div className="flex justify-center pt-4 pb-8">
                <Button 
                  variant="outline" 
                  className="rounded-full px-8 shadow-sm" 
                  onClick={() => fetchNextPage()} 
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isFetchingNextPage ? "Loading..." : "Load Older Discussions"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar Area */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Popular Tags */}
          {popularTags.length > 0 && (
            <div className="bg-card border rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-emerald-500" />
                Popular Topics
              </h3>
              <div className="flex flex-wrap gap-2">
                {popularTags.map(t => (
                  <button 
                    key={t} 
                    onClick={() => setTagFilter(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${tagFilter === t ? 'bg-emerald-500 text-white shadow-md' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Admin Panel (Compact) */}
          {isAdmin && (
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-white text-sm">Admin Controls</h3>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg border">
                  <span className="text-xs font-semibold flex items-center gap-1">
                    {isFrozen ? <Lock className="w-3 h-3 text-red-500" /> : <Unlock className="w-3 h-3 text-emerald-500" />}
                    Forum {isFrozen ? 'Frozen' : 'Active'}
                  </span>
                  <Button 
                    variant={isFrozen ? "default" : "destructive"} 
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => freezeMutation.mutate(!isFrozen)}
                    disabled={freezeMutation.isPending}
                  >
                    {isFrozen ? "Unfreeze" : "Freeze"}
                  </Button>
                </div>

                {blockedUsers.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Ban className="w-3.5 h-3.5 text-red-500" /> Blocked Users</h4>
                    <div className="bg-red-50/50 border border-red-100 rounded-lg p-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {blockedUsers.map((u: string) => (
                          <div key={u} className="flex items-center gap-2 bg-white border border-red-200 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm">
                            <span className="text-red-900">{u}</span>
                            <button onClick={() => unblockMutation.mutate(u)} className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Popular Tags */}
          {popularTags.length > 0 && (
            <div className="bg-card border rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-emerald-500" />
                Popular Topics
              </h3>
              <div className="flex flex-wrap gap-2">
                {popularTags.map(t => (
                  <button 
                    key={t} 
                    onClick={() => setTagFilter(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${tagFilter === t ? 'bg-emerald-500 text-white shadow-md' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Community Guidelines */}
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5">
            <h3 className="font-bold text-emerald-900 mb-3 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              Community Guidelines
            </h3>
            <ul className="space-y-2 text-sm text-emerald-800/80 leading-relaxed list-disc list-inside">
              <li>Be respectful and constructive in your discussions.</li>
              <li>You can use **Markdown** to format your posts!</li>
              <li>Use the Search bar or Tags to find previous insights.</li>
              <li>You can edit your messages within 15 minutes.</li>
              <li>Report inappropriate content to the administrators.</li>
            </ul>
          </div>
          </div>
        </div>
      </main>

      {/* User Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowProfileModal(false)}>
          <div className="bg-background rounded-2xl shadow-xl border max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="h-24 bg-gradient-to-r from-emerald-500 to-teal-500 relative">
              <button className="absolute top-3 right-3 text-white/80 hover:text-white" onClick={() => setShowProfileModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 pb-6 relative">
              <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center shadow-lg border-4 border-background -mt-10 mb-3 mx-auto overflow-hidden">
                {selectedProfile?.avatar_url ? (
                  <img src={selectedProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-2xl">
                    {getInitials(selectedProfileAuthor || "")}
                  </div>
                )}
              </div>
              <h2 className="text-xl font-bold text-center text-foreground">{selectedProfileAuthor}</h2>
              <p className="text-sm text-center text-muted-foreground mt-1 mb-6">
                {selectedProfile?.bio || "No bio provided."}
              </p>
              
              {selectedProfileAuthor === author && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="text-sm font-semibold mb-3">Edit Profile</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    await api.community.updateProfile(author, { bio: fd.get("bio") as string });
                    queryClient.invalidateQueries({ queryKey: ["communityProfile"] });
                    toast({ title: "Profile updated" });
                  }}>
                    <Textarea name="bio" placeholder="Write a short bio..." defaultValue={selectedProfile?.bio} className="text-sm mb-3" />
                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">Save Changes</Button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
