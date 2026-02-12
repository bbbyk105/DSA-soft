package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type R2Client struct {
	client        *s3.Client
	bucket        string
	publicBaseURL string
}

func NewR2Client(accountID, accessKeyID, secretAccessKey, bucket, endpoint, publicBaseURL string) (*R2Client, error) {
	if bucket == "" || endpoint == "" {
		return nil, fmt.Errorf("bucket and endpoint are required")
	}

	cfg, err := config.LoadDefaultConfig(
		context.Background(),
		config.WithRegion("auto"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")),
		config.WithEndpointResolverWithOptions(aws.EndpointResolverWithOptionsFunc(
			func(service, region string, options ...interface{}) (aws.Endpoint, error) {
				if service == s3.ServiceID {
					return aws.Endpoint{
						URL:               endpoint,
						HostnameImmutable: true,
					}, nil
				}
				return aws.Endpoint{}, &aws.EndpointNotFoundError{}
			},
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	return &R2Client{
		client:        client,
		bucket:        bucket,
		publicBaseURL: strings.TrimRight(publicBaseURL, "/"),
	}, nil
}

func (r *R2Client) PutObject(ctx context.Context, key string, data []byte, contentType string) error {
	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	return err
}

func (r *R2Client) GetObject(ctx context.Context, key string) ([]byte, error) {
	out, err := r.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

func (r *R2Client) DeleteObjectsWithPrefix(ctx context.Context, prefix string) error {
	var cont *string
	for {
		listOut, err := r.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(r.bucket),
			Prefix:            aws.String(prefix),
			ContinuationToken: cont,
		})
		if err != nil {
			return err
		}
		if len(listOut.Contents) == 0 && !aws.ToBool(listOut.IsTruncated) {
			return nil
		}

		objs := make([]types.ObjectIdentifier, 0, len(listOut.Contents))
		for _, o := range listOut.Contents {
			if o.Key == nil {
				continue
			}
			objs = append(objs, types.ObjectIdentifier{Key: o.Key})
		}
		if len(objs) > 0 {
			_, err = r.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
				Bucket: aws.String(r.bucket),
				Delete: &types.Delete{Objects: objs, Quiet: aws.Bool(true)},
			})
			if err != nil {
				return err
			}
		}

		if !aws.ToBool(listOut.IsTruncated) {
			return nil
		}
		cont = listOut.NextContinuationToken
	}
}

// GetSignedURL returns a public URL when available.
// (Presigning requires an optional aws-sdk-go-v2 submodule; we keep this backend buildable without it.)
func (r *R2Client) GetSignedURL(ctx context.Context, key string, expires time.Duration) (string, error) {
	if url := r.GetPublicURL(key); url != "" {
		return url, nil
	}
	return "", fmt.Errorf("signed url not available (R2_PUBLIC_BASE_URL not set)")
}

func (r *R2Client) GetPublicURL(key string) string {
	if r.publicBaseURL == "" || key == "" {
		return ""
	}
	return r.publicBaseURL + "/" + strings.TrimLeft(key, "/")
}

