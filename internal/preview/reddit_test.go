package preview

import (
	"context"
	"net/http"
	"testing"
)

func TestRedditAtomPostAndComment(t *testing.T) {
	for _, comment := range []bool{false, true} {
		target := "https://old.reddit.com/r/test/comments/abc/title/"
		expected := "Post"
		if comment {
			target += "def/"
			expected = "Comment"
		}
		s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			if r.URL.String() != "https://www.reddit.com/r/test/comments/abc.rss?limit=4" {
				t.Fatal(r.URL)
			}
			return response(r, `<feed><title>Feed</title><entry><id>t3_abc</id><title>Post</title><content type="html">&lt;p&gt;Text&lt;/p&gt;&lt;img src="https://i.redd.it/image.jpg"&gt;&lt;script&gt;private&lt;/script&gt;</content><author><name>/u/author</name></author><published>2026-10-11T12:00:00Z</published></entry><entry><id>t1_def</id><title>Comment</title><content>Reply</content></entry></feed>`, "application/atom+xml"), nil
		})})
		card, err := s.Load(context.Background(), target)
		s.Close()
		if err != nil || card.Title != expected || card.Site != "Reddit" {
			t.Fatalf("%+v %v", card, err)
		}
		if !comment && (card.Description != "Text" || card.Author != "u/author" || card.Image != "https://i.redd.it/image.jpg") {
			t.Fatalf("unsafe or incomplete content %+v", card)
		}
	}
}
func TestRedditCollectionAndFailure(t *testing.T) {
	s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/user/one.rss" {
			return response(r, `<feed><title>User one</title><subtitle>Recent posts</subtitle><entry><title>First</title></entry></feed>`, "application/atom+xml"), nil
		}
		return response(r, "<title>Fallback</title>", "text/html"), nil
	})})
	defer s.Close()
	card, err := s.Load(context.Background(), "https://www.reddit.com/u/one")
	if err != nil || card.Title != "User one" || card.Description != "Recent posts · First" {
		t.Fatalf("%+v %v", card, err)
	}
	card, err = s.Load(context.Background(), "https://www.reddit.com/r/broken")
	if err != nil || card.Title != "Fallback" {
		t.Fatalf("fallback %+v %v", card, err)
	}
}
