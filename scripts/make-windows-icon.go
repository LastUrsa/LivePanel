package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
)

var iconSizes = []int{16, 24, 32, 48, 64, 128, 256}

func main() {
	if len(os.Args) != 3 {
		_, _ = fmt.Fprintln(os.Stderr, "usage: go run ./scripts/make-windows-icon.go source.png output.ico")
		os.Exit(2)
	}

	source, err := loadPNG(os.Args[1])
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "load source: %v\n", err)
		os.Exit(1)
	}

	images := make([][]byte, 0, len(iconSizes))
	for _, size := range iconSizes {
		data, err := encodePNG(resizeNearest(source, size, size))
		if err != nil {
			_, _ = fmt.Fprintf(os.Stderr, "encode %dx%d icon: %v\n", size, size, err)
			os.Exit(1)
		}
		images = append(images, data)
	}

	if err := writeICO(os.Args[2], iconSizes, images); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "write ico: %v\n", err)
		os.Exit(1)
	}
}

func loadPNG(path string) (image.Image, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return png.Decode(file)
}

func resizeNearest(src image.Image, width int, height int) *image.NRGBA {
	dst := image.NewNRGBA(image.Rect(0, 0, width, height))
	bounds := src.Bounds()
	sourceWidth := bounds.Dx()
	sourceHeight := bounds.Dy()
	for y := 0; y < height; y++ {
		sourceY := bounds.Min.Y + y*sourceHeight/height
		for x := 0; x < width; x++ {
			sourceX := bounds.Min.X + x*sourceWidth/width
			dst.Set(x, y, color.NRGBAModel.Convert(src.At(sourceX, sourceY)))
		}
	}
	return dst
}

func encodePNG(img image.Image) ([]byte, error) {
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func writeICO(path string, sizes []int, images [][]byte) error {
	var out bytes.Buffer
	if err := binary.Write(&out, binary.LittleEndian, uint16(0)); err != nil {
		return err
	}
	if err := binary.Write(&out, binary.LittleEndian, uint16(1)); err != nil {
		return err
	}
	if err := binary.Write(&out, binary.LittleEndian, uint16(len(images))); err != nil {
		return err
	}

	offset := 6 + 16*len(images)
	for index, data := range images {
		size := sizes[index]
		widthByte := byte(size)
		heightByte := byte(size)
		if size >= 256 {
			widthByte = 0
			heightByte = 0
		}
		out.WriteByte(widthByte)
		out.WriteByte(heightByte)
		out.WriteByte(0)
		out.WriteByte(0)
		if err := binary.Write(&out, binary.LittleEndian, uint16(1)); err != nil {
			return err
		}
		if err := binary.Write(&out, binary.LittleEndian, uint16(32)); err != nil {
			return err
		}
		if err := binary.Write(&out, binary.LittleEndian, uint32(len(data))); err != nil {
			return err
		}
		if err := binary.Write(&out, binary.LittleEndian, uint32(offset)); err != nil {
			return err
		}
		offset += len(data)
	}

	for _, data := range images {
		if _, err := out.Write(data); err != nil {
			return err
		}
	}

	return os.WriteFile(path, out.Bytes(), 0o644)
}
