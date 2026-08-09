import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Image as ImageIcon, Send, Clock, Tag as TagIcon, X, Loader2, Trash2, ShieldAlert, Lock, Unlock, Ban } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function CommunityPage() {
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [tag, setTag] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["communityComments"],
    queryFn: () => api.community.getComments(),
    refetchInterval: 10000 // Poll every 10s
  });

  const postMutation = useMutation({
    mutationFn: async (imgUrl?: string) => {
      return api.community.postComment({
        author,
        content,
        tag: tag || undefined,
        image_url: imgUrl,
      });
    },
    onSuccess: () => {
      setContent("");
      setTag("");
      setImageFile(null);
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
    mutationFn: (id: number) => api.community.deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communityComments"] });
      toast({ title: "Message deleted" });
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

  const isFrozen = data?.is_frozen ?? false;
  const blockedUsers = data?.blocked_users ?? [];
  const cannotPost = (!isAdmin && isFrozen);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cannotPost) return;
    if (!author.trim() || !content.trim()) return;

    if (imageFile) {
      setUploadingImage(true);
      try {
        const fd = new FormData();
        fd.append("file", imageFile);
        const res = await api.community.uploadImage(fd);
        await postMutation.mutateAsync(res.url);
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
      postMutation.mutate();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3 border-b pb-4">
        <MessageSquare className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Community Forum</h1>
          <p className="text-muted-foreground mt-1">Discuss analysis results, share insights, and ask questions safely.</p>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-destructive/10 border-destructive/20 border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="w-5 h-5" />
            <span className="font-medium">Admin Controls</span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant={isFrozen ? "default" : "destructive"} 
              size="sm" 
              onClick={() => freezeMutation.mutate(!isFrozen)}
              disabled={freezeMutation.isPending}
            >
              {isFrozen ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              {isFrozen ? "Unfreeze Forum" : "Freeze Forum"}
            </Button>
          </div>
        </div>
      )}
      
      {isAdmin && blockedUsers.length > 0 && (
        <div className="bg-muted border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2"><Ban className="w-4 h-4" /> Blocked Users</h4>
          <div className="flex flex-wrap gap-2">
            {blockedUsers.map((u: string) => (
              <div key={u} className="flex items-center gap-2 bg-background border px-3 py-1 rounded-full text-sm">
                <span>{u}</span>
                <button onClick={() => unblockMutation.mutate(u)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {cannotPost && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-4 text-center font-medium">
          The forum is currently frozen by an administrator. No new comments can be posted at this time.
        </div>
      )}

      <div className="bg-card border rounded-xl shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-lg">Post a new comment</h3>
        <form onSubmit={handleSubmit} className="space-y-4 opacity-100 transition-opacity" style={{ opacity: cannotPost ? 0.5 : 1 }}>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              placeholder="Your Name (e.g. Analyst_123)" 
              value={author} 
              onChange={e => setAuthor(e.target.value)} 
              disabled={cannotPost}
              required
            />
            <Input 
              placeholder="Optional Tag (e.g. Biomass, Drought)" 
              value={tag} 
              onChange={e => setTag(e.target.value)} 
              disabled={cannotPost}
            />
          </div>
          
          <Textarea 
            placeholder="Type your message here..." 
            value={content} 
            onChange={e => setContent(e.target.value)} 
            className="min-h-[100px]"
            disabled={cannotPost}
            required
          />

          {imageFile && (
            <div className="relative inline-block border rounded p-1">
              <img src={URL.createObjectURL(imageFile)} alt="Preview" className="h-20 w-auto rounded" />
              <button 
                type="button" 
                onClick={() => setImageFile(null)}
                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
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
                <Button type="button" variant="outline" size="sm" className="gap-2 cursor-pointer" disabled={cannotPost} asChild>
                  <span><ImageIcon className="w-4 h-4" /> Add Image</span>
                </Button>
              </label>
              <span className="text-xs text-muted-foreground ml-3">PNG/JPG only. Images are securely scanned.</span>
            </div>
            
            <Button type="submit" disabled={cannotPost || postMutation.isPending || uploadingImage || !author.trim() || !content.trim()}>
              {postMutation.isPending || uploadingImage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {uploadingImage ? "Processing Image..." : "Post Message"}
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : data?.comments?.length === 0 ? (
          <div className="text-center p-12 border rounded-xl bg-slate-50 text-slate-500">
            No comments yet. Be the first to start the discussion!
          </div>
        ) : (
          data?.comments?.map((comment: any) => (
            <div key={comment.id} className="bg-white border rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-slate-900">{comment.author}</div>
                  {comment.tag && (
                    <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TagIcon className="w-3 h-3" /> {comment.tag}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true })}
                  {isAdmin && (
                    <div className="flex items-center gap-1 ml-2 border-l pl-2">
                      <button onClick={() => deleteMutation.mutate(comment.id)} className="p-1 hover:bg-destructive/10 text-destructive rounded" title="Delete Comment">
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => blockMutation.mutate(comment.author)} className="p-1 hover:bg-destructive/10 text-destructive rounded" title="Block User">
                        <Ban className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="text-slate-700 whitespace-pre-wrap">{comment.content}</div>
              
              {comment.image_url && (
                <div className="mt-4">
                  <img src={comment.image_url} alt="Attached" className="max-h-64 rounded-lg border shadow-sm" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
