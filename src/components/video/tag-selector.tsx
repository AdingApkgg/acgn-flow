"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Plus, Search, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  slug?: string;
}

interface TagSelectorProps {
  allTags?: Tag[];
  selectedTags: Tag[];
  newTags: string[];
  onSelectedTagsChange: (tags: Tag[]) => void;
  onNewTagsChange: (tags: string[]) => void;
  maxTags?: number;
  className?: string;
}

export function TagSelector({
  allTags = [],
  selectedTags,
  newTags,
  onSelectedTagsChange,
  onNewTagsChange,
  maxTags = 10,
  className,
}: TagSelectorProps) {
  const [newTagInput, setNewTagInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const totalTags = selectedTags.length + newTags.length;
  const canAddMore = totalTags < maxTags;

  // 过滤标签
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return allTags;
    const query = searchQuery.toLowerCase();
    return allTags.filter((tag) =>
      tag.name.toLowerCase().includes(query)
    );
  }, [allTags, searchQuery]);

  const handleAddNewTag = () => {
    const tag = newTagInput.trim();
    if (!tag) return;
    if (!canAddMore) return;
    if (newTags.includes(tag)) return;
    if (selectedTags.some((t) => t.name.toLowerCase() === tag.toLowerCase())) return;
    
    // 检查是否匹配已有标签
    const existingTag = allTags.find((t) => t.name.toLowerCase() === tag.toLowerCase());
    if (existingTag) {
      onSelectedTagsChange([...selectedTags, existingTag]);
    } else {
      onNewTagsChange([...newTags, tag]);
    }
    setNewTagInput("");
  };

  const handleRemoveNewTag = (tag: string) => {
    onNewTagsChange(newTags.filter((t) => t !== tag));
  };

  const toggleTag = (tag: Tag) => {
    const exists = selectedTags.find((t) => t.id === tag.id);
    if (exists) {
      onSelectedTagsChange(selectedTags.filter((t) => t.id !== tag.id));
    } else if (canAddMore) {
      onSelectedTagsChange([...selectedTags, tag]);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* 已选标签 */}
      {(selectedTags.length > 0 || newTags.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="default"
              className="cursor-pointer hover:bg-primary/80 transition-colors"
              onClick={() => toggleTag(tag)}
            >
              {tag.name}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {newTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80 transition-colors"
              onClick={() => handleRemoveNewTag(tag)}
            >
              <Plus className="h-3 w-3 mr-1" />
              {tag}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}

      {/* 添加新标签 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={canAddMore ? "输入新标签名称..." : `已达到最大标签数 (${maxTags})`}
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddNewTag();
              }
            }}
            disabled={!canAddMore}
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleAddNewTag}
          disabled={!canAddMore || !newTagInput.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* 标签数量提示 */}
      <p className="text-xs text-muted-foreground">
        已选择 {totalTags} / {maxTags} 个标签
      </p>

      {/* 已有标签列表 */}
      {allTags.length > 0 && (
        <div className="space-y-2">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* 标签列表 */}
          <ScrollArea className="h-32 rounded-md border p-2">
            <div className="flex flex-wrap gap-1.5">
              {filteredTags.length > 0 ? (
                filteredTags.map((tag) => {
                  const isSelected = selectedTags.some((t) => t.id === tag.id);
                  return (
                    <Badge
                      key={tag.id}
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer text-xs transition-colors",
                        isSelected
                          ? "hover:bg-primary/80"
                          : "hover:bg-accent"
                      )}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag.name}
                    </Badge>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  {searchQuery ? "未找到匹配的标签" : "暂无标签"}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
