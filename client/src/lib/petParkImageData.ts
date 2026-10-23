export async function readPetParkImageData(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}
