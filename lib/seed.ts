import { ID, Permission, Role } from "react-native-appwrite";
import { appwriteConfig, databases, storage } from "./appwrite";
import dummyData from "./data";

interface Category {
    name: string;
    description: string;
}

interface Customization {
    name: string;
    price: number;
    type: "topping" | "side" | "size" | "crust" | string;
}

interface MenuItem {
    name: string;
    description: string;
    image_url: string;
    price: number;
    rating: number;
    calories: number;
    protein: number;
    category_name: string;
    customizations: string[];
}

interface DummyData {
    categories: Category[];
    customizations: Customization[];
    menu: MenuItem[];
}

const data = dummyData as DummyData;

async function clearAll(collectionId: string): Promise<void> {
    try {
        const list = await databases.listDocuments(
            appwriteConfig.databaseId,
            collectionId
        );

        await Promise.all(
            list.documents.map((doc) =>
                databases.deleteDocument(appwriteConfig.databaseId, collectionId, doc.$id)
            )
        );
        console.log(`✅ Cleared collection: ${collectionId}`);
    } catch (error) {
        console.error(`❌ Error clearing collection ${collectionId}:`, error);
        throw error;
    }
}

async function clearStorage(): Promise<void> {
    try {
        const list = await storage.listFiles(appwriteConfig.bucketId);

        await Promise.all(
            list.files.map((file) =>
                storage.deleteFile(appwriteConfig.bucketId, file.$id)
            )
        );
        console.log("✅ Cleared storage");
    } catch (error) {
        console.error("❌ Error clearing storage:", error);
        throw error;
    }
}

async function uploadImageToStorage(imageUrl: string, retries = 3): Promise<string> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`📤 Uploading image (attempt ${attempt}/${retries}): ${imageUrl}`);

            // Validate URL
            if (!imageUrl || !imageUrl.startsWith('http')) {
                throw new Error(`Invalid image URL: ${imageUrl}`);
            }

            // Fetch with timeout and proper headers
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(imageUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/*,*/*;q=0.8',
                },
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const blob = await response.blob();

            if (!blob || blob.size === 0) {
                throw new Error('Empty or invalid image data');
            }

            // Generate a proper filename
            const urlPath = new URL(imageUrl).pathname;
            const extension = urlPath.split('.').pop()?.toLowerCase() || 'jpg';
            const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`;

            // Create file object for React Native
            const fileObj = {
                name: filename,
                type: blob.type || 'image/jpeg',
                size: blob.size,
                uri: imageUrl,
            };

            console.log(`📝 File info: ${filename}, type: ${fileObj.type}, size: ${fileObj.size} bytes`);

            // Upload file with public read permissions
            const file = await storage.createFile(
                appwriteConfig.bucketId,
                ID.unique(),
                fileObj,
                [
                    Permission.read(Role.any()), // Allow anyone to read the file
                    Permission.write(Role.any()), // Optional: Allow anyone to write (be careful with this)
                ]
            );

            // Get the public view URL
            const viewUrl = storage.getFileView(appwriteConfig.bucketId, file.$id);
            console.log(`✅ Image uploaded successfully: ${filename}`);

            return viewUrl.toString();

        } catch (error) {
            console.error(`❌ Upload attempt ${attempt} failed:`, error);

            if (attempt === retries) {
                console.error(`❌ All upload attempts failed for: ${imageUrl}`);
                // Return original URL as fallback instead of throwing
                console.log(`📎 Using original URL as fallback: ${imageUrl}`);
                return imageUrl;
            }

            // Wait before retry (exponential backoff)
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // Fallback to original URL
    return imageUrl;
}

async function seed(): Promise<void> {
    try {
        console.log("🌱 Starting seeding process...");

        // 1. Clear all collections and storage
        console.log("🧹 Clearing existing data...");
        await clearAll(appwriteConfig.categoriesCollectionId);
        await clearAll(appwriteConfig.customizationsCollectionId);
        await clearAll(appwriteConfig.menuCollectionId);
        await clearAll(appwriteConfig.menuCustomizationsCollectionId);
        await clearStorage();

        // 2. Create Categories
        console.log("📂 Creating categories...");
        const categoryMap: Record<string, string> = {};
        for (const cat of data.categories) {
            try {
                const doc = await databases.createDocument(
                    appwriteConfig.databaseId,
                    appwriteConfig.categoriesCollectionId,
                    ID.unique(),
                    cat
                );
                categoryMap[cat.name] = doc.$id;
                console.log(`✅ Category created: ${cat.name}`);
            } catch (error) {
                console.error(`❌ Failed to create category ${cat.name}:`, error);
                throw error;
            }
        }

        // 3. Create Customizations
        console.log("⚙️ Creating customizations...");
        const customizationMap: Record<string, string> = {};
        for (const cus of data.customizations) {
            try {
                const doc = await databases.createDocument(
                    appwriteConfig.databaseId,
                    appwriteConfig.customizationsCollectionId,
                    ID.unique(),
                    {
                        name: cus.name,
                        price: cus.price,
                        type: cus.type,
                    }
                );
                customizationMap[cus.name] = doc.$id;
                console.log(`✅ Customization created: ${cus.name}`);
            } catch (error) {
                console.error(`❌ Failed to create customization ${cus.name}:`, error);
                throw error;
            }
        }

        // 4. Create Menu Items
        console.log("🍕 Creating menu items...");
        const menuMap: Record<string, string> = {};

        for (let i = 0; i < data.menu.length; i++) {
            const item = data.menu[i];
            console.log(`\n📝 Processing menu item ${i + 1}/${data.menu.length}: ${item.name}`);

            try {
                // Upload image with better error handling
                const uploadedImageUrl = await uploadImageToStorage(item.image_url);

                // Check if category exists
                if (!categoryMap[item.category_name]) {
                    throw new Error(`Category "${item.category_name}" not found in categoryMap`);
                }

                const doc = await databases.createDocument(
                    appwriteConfig.databaseId,
                    appwriteConfig.menuCollectionId,
                    ID.unique(),
                    {
                        name: item.name,
                        description: item.description,
                        image_url: uploadedImageUrl,
                        price: item.price,
                        rating: item.rating,
                        calories: item.calories,
                        protein: item.protein,
                        categories: categoryMap[item.category_name],
                    }
                );

                menuMap[item.name] = doc.$id;
                console.log(`✅ Menu item created: ${item.name}`);

                // 5. Create menu_customizations
                if (item.customizations && item.customizations.length > 0) {
                    console.log(`🔧 Adding customizations for ${item.name}...`);
                    for (const cusName of item.customizations) {
                        try {
                            if (!customizationMap[cusName]) {
                                console.warn(`⚠️ Customization "${cusName}" not found, skipping...`);
                                continue;
                            }

                            await databases.createDocument(
                                appwriteConfig.databaseId,
                                appwriteConfig.menuCustomizationsCollectionId,
                                ID.unique(),
                                {
                                    menu: doc.$id,
                                    customizations: customizationMap[cusName],
                                }
                            );
                            console.log(`✅ Menu customization linked: ${item.name} -> ${cusName}`);
                        } catch (error) {
                            console.error(`❌ Failed to create menu customization ${cusName}:`, error);
                            // Continue with other customizations instead of failing completely
                        }
                    }
                }

            } catch (error) {
                console.error(`❌ Failed to create menu item ${item.name}:`, error);
                throw error;
            }
        }

        console.log("\n✅ Seeding completed successfully!");
        console.log(`📊 Summary:`);
        console.log(`   Categories: ${Object.keys(categoryMap).length}`);
        console.log(`   Customizations: ${Object.keys(customizationMap).length}`);
        console.log(`   Menu Items: ${Object.keys(menuMap).length}`);

    } catch (error) {
        console.error("❌ Seeding failed:", error);
        throw error;
    }
}

export default seed;