import React, { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Edit, Plus, Image as ImageIcon, Loader2, ArrowUp, ArrowDown, Type, Image, Video, BarChart3, LayoutTemplate } from "lucide-react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface StorySection {
  id: string;
  title: string;
  text: string;
  mediaType: "image" | "video" | "chart" | "none";
  mediaUrl: string;
}

export function BlogManager() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPost, setCurrentPost] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const quillRef = useRef<ReactQuill>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("News");
  const [excerpt, setExcerpt] = useState("");
  const [readTime, setReadTime] = useState("3 min read");
  const [imageUrl, setImageUrl] = useState("");
  const [content, setContent] = useState("");
  
  // StoryMap State
  const [isStoryMap, setIsStoryMap] = useState(false);
  const [storySections, setStorySections] = useState<StorySection[]>([]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await api.blog.list();
      setPosts(res.posts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleOpenNew = () => {
    setIsEditing(false);
    setCurrentPost(null);
    setTitle("");
    setCategory("News");
    setExcerpt("");
    setReadTime("3 min read");
    setImageUrl("");
    setContent("");
    setIsStoryMap(false);
    setStorySections([]);
    setDialogOpen(true);
  };

  const handleOpenEdit = (post: any) => {
    setIsEditing(true);
    setCurrentPost(post);
    setTitle(post.title);
    setCategory(post.category);
    setExcerpt(post.excerpt);
    setReadTime(post.read_time);
    setImageUrl(post.image_url);
    
    try {
      const parsed = JSON.parse(post.content);
      if (parsed.type === "storymap") {
        setIsStoryMap(true);
        setStorySections(parsed.sections || []);
        setContent("");
      } else {
        setIsStoryMap(false);
        setContent(post.content);
        setStorySections([]);
      }
    } catch {
      setIsStoryMap(false);
      setContent(post.content);
      setStorySections([]);
    }
    
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await api.blog.delete(id);
      loadPosts();
    } catch (e) {
      console.error(e);
      alert("Failed to delete post");
    }
  };

  const handleSave = async () => {
    if (!title) {
      alert("Title is required.");
      return;
    }

    const finalContent = isStoryMap ? JSON.stringify({ type: "storymap", sections: storySections }) : content;

    if (!finalContent) {
      alert("Content is required.");
      return;
    }

    const payload = { title, excerpt, category, read_time: readTime, image_url: imageUrl, content: finalContent };

    try {
      if (isEditing) {
        await api.blog.update(currentPost.id, payload);
      } else {
        await api.blog.create(payload);
      }
      setDialogOpen(false);
      loadPosts();
    } catch (e) {
      console.error(e);
      alert("Failed to save post");
    }
  };

  // Custom Image Handler for React Quill
  const imageHandler = () => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*,video/*,application/pdf");
    input.click();

    input.onchange = async () => {
      const file = input.files ? input.files[0] : null;
      if (!file) return;

      try {
        const res = await api.blog.upload(file);
        const editor = quillRef.current?.getEditor();
        if (editor) {
          const range = editor.getSelection();
          if (range) {
            if (file.type.startsWith("image/")) {
              editor.insertEmbed(range.index, "image", res.url);
            } else if (file.type.startsWith("video/")) {
              editor.insertEmbed(range.index, "video", res.url);
            } else {
              editor.insertText(range.index, file.name, "link", res.url);
            }
          }
        }
      } catch (e) {
        console.error("Upload failed", e);
        alert("File upload failed");
      }
    };
  };

  const modules = {
    toolbar: {
      container: [
        [{ header: [1, 2, 3, 4, 5, 6, false] }],
        ["bold", "italic", "underline", "strike", "blockquote"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image", "video"],
        ["clean"]
      ],
      handlers: {
        image: imageHandler
      }
    }
  };

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;
    try {
      const res = await api.blog.upload(file);
      setImageUrl(res.url);
    } catch (err) {
      console.error(err);
      alert("Image upload failed");
    }
  };

  const handleSectionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, sectionId: string) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;
    try {
      const res = await api.blog.upload(file);
      setStorySections(sections => sections.map(s => s.id === sectionId ? { ...s, mediaUrl: res.url } : s));
    } catch (err) {
      console.error(err);
      alert("Media upload failed");
    }
  };

  const addSection = () => {
    setStorySections([...storySections, { id: Date.now().toString(), title: "", text: "", mediaType: "none", mediaUrl: "" }]);
  };

  const removeSection = (id: string) => {
    setStorySections(storySections.filter(s => s.id !== id));
  };

  const moveSection = (index: number, direction: 1 | -1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= storySections.length) return;
    const newSections = [...storySections];
    const temp = newSections[index];
    newSections[index] = newSections[newIndex];
    newSections[newIndex] = temp;
    setStorySections(newSections);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Manage Blog & Case Studies</h3>
        <Button onClick={handleOpenNew}><Plus className="w-4 h-4 mr-2" /> New Post</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="border border-border/50 rounded-xl overflow-hidden divide-y divide-border/50">
          {posts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No posts found. Create one!</div>
          ) : (
            posts.map(post => (
              <div key={post.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                <div>
                  <div className="font-semibold">{post.title}</div>
                  <div className="text-sm text-muted-foreground flex gap-3">
                    <span>{post.category}</span>
                    <span>•</span>
                    <span>{new Date(post.timestamp).toLocaleDateString()}</span>
                    {post.content && post.content.startsWith('{"type":"storymap"') && (
                      <span className="flex items-center text-indigo-500 gap-1 ml-2"><LayoutTemplate className="w-3 h-3"/> StoryMap</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(post)}>
                    <Edit className="w-4 h-4 text-blue-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(post.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Post" : "Create New Post"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            
            <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg border border-border">
              <div>
                <h4 className="font-medium flex items-center gap-2"><LayoutTemplate className="w-4 h-4"/> Interactive StoryMap Format</h4>
                <p className="text-sm text-muted-foreground">Use the new scroll-driven immersive layout instead of a standard article.</p>
              </div>
              <Switch checked={isStoryMap} onCheckedChange={setIsStoryMap} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Post title" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. News, Case Study" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Excerpt (Short description)</Label>
              <Input value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Brief summary" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Read Time</Label>
                <Input value={readTime} onChange={e => setReadTime(e.target.value)} placeholder="e.g. 4 min read" />
              </div>
              <div className="space-y-2">
                <Label>Main Image URL</Label>
                <div className="flex gap-2">
                  <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://... or upload" />
                  <Button variant="outline" className="relative shrink-0">
                    <ImageIcon className="w-4 h-4" />
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={handleMainImageUpload}
                      accept="image/*"
                    />
                  </Button>
                </div>
              </div>
            </div>

            {isStoryMap ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-lg">Story Sections</Label>
                  <Button size="sm" onClick={addSection}><Plus className="w-4 h-4 mr-2"/> Add Section</Button>
                </div>
                
                {storySections.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                    No sections added yet. Click "Add Section" to start building your story.
                  </div>
                )}

                <div className="space-y-6">
                  {storySections.map((section, index) => (
                    <Card key={section.id} className="relative shadow-sm border-border">
                      <CardHeader className="py-3 px-4 bg-muted/20 border-b flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium">Section {index + 1}</CardTitle>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(index, -1)} disabled={index === 0}>
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(index, 1)} disabled={index === storySections.length - 1}>
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => removeSection(section.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Left: Content */}
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Type className="w-3 h-3"/> Heading</Label>
                              <Input 
                                value={section.title} 
                                onChange={e => setStorySections(s => s.map(sec => sec.id === section.id ? { ...sec, title: e.target.value } : sec))}
                                placeholder="Section title"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Type className="w-3 h-3"/> Narrative Text</Label>
                              <Textarea 
                                value={section.text}
                                onChange={e => setStorySections(s => s.map(sec => sec.id === section.id ? { ...sec, text: e.target.value } : sec))}
                                placeholder="Write your story content here..."
                                className="min-h-[150px]"
                              />
                            </div>
                          </div>
                          
                          {/* Right: Media */}
                          <div className="space-y-4 bg-muted/10 p-4 rounded-lg border border-border/50">
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Background Media Type</Label>
                              <Select 
                                value={section.mediaType} 
                                onValueChange={(val: any) => setStorySections(s => s.map(sec => sec.id === section.id ? { ...sec, mediaType: val } : sec))}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None (Solid Color)</SelectItem>
                                  <SelectItem value="image"><span className="flex items-center gap-2"><Image className="w-4 h-4"/> Image</span></SelectItem>
                                  <SelectItem value="video"><span className="flex items-center gap-2"><Video className="w-4 h-4"/> Video</span></SelectItem>
                                  <SelectItem value="chart"><span className="flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Chart (Image)</span></SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            {section.mediaType !== "none" && (
                              <div className="space-y-2 pt-2 border-t border-border/50">
                                <Label className="text-xs text-muted-foreground">Media URL</Label>
                                <div className="flex gap-2">
                                  <Input 
                                    value={section.mediaUrl} 
                                    onChange={e => setStorySections(s => s.map(sec => sec.id === section.id ? { ...sec, mediaUrl: e.target.value } : sec))}
                                    placeholder="https://... or upload"
                                  />
                                  <Button variant="outline" className="relative shrink-0" size="icon">
                                    <ImageIcon className="w-4 h-4" />
                                    <input 
                                      type="file" 
                                      className="absolute inset-0 opacity-0 cursor-pointer" 
                                      onChange={e => handleSectionImageUpload(e, section.id)}
                                      accept={section.mediaType === "video" ? "video/*" : "image/*"}
                                    />
                                  </Button>
                                </div>
                                {section.mediaUrl && (
                                  <div className="mt-2 rounded-md overflow-hidden bg-black/5 aspect-video flex items-center justify-center border">
                                    {section.mediaType === "video" ? (
                                      <video src={section.mediaUrl} className="w-full h-full object-cover" muted loop playsInline />
                                    ) : (
                                      <img src={section.mediaUrl} className="w-full h-full object-cover" alt="Media preview" />
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Content (Rich Text)</Label>
                <div className="border rounded-md">
                  <ReactQuill 
                    ref={quillRef}
                    theme="snow" 
                    value={content} 
                    onChange={setContent} 
                    modules={modules}
                    style={{ height: '300px', paddingBottom: '40px' }}
                  />
                </div>
              </div>
            )}
            
            <div className="pt-8 flex justify-end gap-3 sticky bottom-0 bg-background/90 backdrop-blur-sm p-4 border-t mt-4 -mx-4 -mb-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} className="min-w-[120px]">
                Save Post
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
