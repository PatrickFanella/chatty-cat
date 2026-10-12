package preview

import (
	"context"
	"net/http"
	"testing"
)

func TestPublicMediaMetadata(t *testing.T) {
	for _, target := range []string{"https://www.instagram.com/reel/AbCdE123/", "https://imgur.com/gallery/title-AbCdE12"} {
		s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
			return response(r, `<title>Public title</title><meta property="og:image" content="https://cdn.example.net/post.jpg"><meta property="og:video:secure_url" content="https://cdn.example.net/post.mp4?signature=keep">`, "text/html"), nil
		})})
		card, err := s.Load(context.Background(), target)
		s.Close()
		if err != nil || card.Title != "Public title" || card.Video != "https://cdn.example.net/post.mp4?signature=keep" || card.TTL != 300 {
			t.Fatalf("%+v %v", card, err)
		}
	}
}
func TestImgurThumbnailFallbackAndUnsafeVideo(t *testing.T) {
	s := New(&http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		return response(r, `<title>Imgur</title><meta property="og:video" content="https://127.0.0.1/private.mp4">`, "text/html"), nil
	})})
	defer s.Close()
	card, err := s.Load(context.Background(), "https://imgur.com/AbCdE12")
	if err != nil || card.Image != "https://i.imgur.com/AbCdE12.png" || card.Video != "" {
		t.Fatalf("%+v %v", card, err)
	}
}
