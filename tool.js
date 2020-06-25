/*
Available args:
    bucketName (string)
    storageType (string) Values: STANDARD | REDUCED_REDUNDANCY | STANDARD_IA | ONEZONE_IA | INTELLIGENT_TIERING | GLACIER | DEEP_ARCHIVE
    groupby (string) Values: Region
    sizeType (string) Values: 'Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'

Example: node tool.js --bucketName xvz --storageType STANDARD --groupby Region --sizeType GB
*/

const AWS = require('aws-sdk');
const s3 = new AWS.S3({Version:2006-03-01});
const async = require('async');
const moment = require('moment');
var argv = require('minimist')(process.argv.slice(2));

main()

function main() {
    console.log(argv)
    async.waterfall(
        [
            async.apply( s3Buckets ),
            async.apply( filterBucketName ),
            async.apply( iteration ),
            async.apply ( groupby )
        ],
        (error, result) =>{

            if(error){
                console.log(error)
            }else{
                console.log(result)
            }
        }
    )
}

/**
 * Retrieve all S3 bucket names
 * @param {Function} callback 
 */
function s3Buckets(callback) {
    s3.listBuckets(callback)
}

/**
 * Filter the given buckets name
 * @param {Array} BucketNames
 * @param {Function} callback 
 */
function filterBucketName(BucketNames, callback) {
    async.filter(
        BucketNames.Buckets,
        (item, cb) => {
            cb (null, 
                (!argv.bucketName || argv.bucketName == item.Name)
            )
        },callback
    )
}

/**
 * Filter objects by their storage type
 * @param {String} storageType 
 */
function filterStorageType(storageType) {
    return (!argv.storageType || argv.storageType == storageType)
}

/**
 * Group the given final result by region
 * @param {Array} bucketInfo 
 * @param {Function} callback
 */
function groupby(bucketInfo, callback) {
    if(argv.groupby){
        async.groupBy(
            bucketInfo,
            (item, cb) => { cb(null,item[argv.groupby])},
            callback
        )
    }else(
        callback(null, bucketInfo)
    )
}

/**
 * Iterate into the all given buckets
 * @param {Array} Buckets 
 * @param {Function} callback 
 */
function iteration(Buckets, callback) {
    async.map(
        Buckets,
        async.apply ( actions ),
        callback
    )
}

/**
 * Apply action for each bucket
 * @param {JSON} bucketInfo 
 * @param {Function} callback
 */
function actions(bucketInfo, callback) {
    async.parallel([
        async.apply ( calculate, bucketInfo ),
        async.apply( location, bucketInfo),
    ],
    (error, result) => {
        console.log(bucketInfo.Name," has done.")
        // Adds the location into the other bucket's info
        callback(error,Object.assign(result[0],result[1])) 
    }

    )
}

/**
 * Finds the given bucket's location
 * @param {JSON} bucketInfo 
 * @param {Function} callback 
 */
function location(bucketInfo,callback) {
    s3.getBucketLocation(
        {Bucket: bucketInfo.Name},
        (err,result) =>{
            if(result.LocationConstraint == ""){
                Region = "us-east-1"
            }else{
                Region = result.LocationConstraint
            }
            callback(err, {Region})
        }
        )
}

/**
 * Retrieve the given bucket's details and summarize them
 * @param {JOSN} bucketInfo 
 * @param {Function} callback 
 */
function calculate(bucketInfo, callback) {
    var BucketName = bucketInfo.Name
    var marker = true;
    var Contents = {
        Name: BucketName,
        Size: 0,
        LastModified: null,
        Cost: 0,
        StorageType: null,
        Files: 0

    }
    async.whilst(
        (cb) => { marker ? cb(null, true): cb(null, false)},
        (cb) => {
            var params = {
                Bucket: BucketName,
            }

            if(marker && marker != true) {params.Marker = marker}

            s3.listObjects(
                params,
                (error, result) => {
                    marker = undefined;

                    // Pagination
                    if(result.IsTruncated || result.NextMarker){
                        marker = result.NextMarker ? result.NextMarker : result.Contents[999].Key;
                    }

                    // Skip the empty Buckets
                    if(result.Contents.length > 0){

                        // Calculate the Size, Cost, Number of files and last modified date
                        async.reduce(
                            result.Contents,
                            {Cost: 0, Size: 0, LastModified: null},
                            (memo, item, callback) => {
                                // Calculate the cost based on the storage type, size and how long th file exist
                                var totalCost =priceCalculation(item.StorageClass, moment().diff(item.LastModified, 'month'), item.Size,0).toFixed(10)
                                let temp = {
                                    Size: memo.Size<item.Size ? item.Size : memo.Size,
                                    LastModified: memo.LastModified<item.LastModified || memo.LastModified == null ? item.LastModified : memo.LastModified,
                                    Cost: memo.Cost == 0 ? ( parseFloat(memo.Cost)+parseFloat(totalCost) ).toFixed(10) : parseFloat(totalCost),
                                    StorageClass: item.StorageClass
                                }
                                callback(error, temp)
                            },
                            (error, result2) => {
                                
                                // A filter for Storage type
                                if (filterStorageType(result2.StorageClass)) {
                                    Contents.Files += result.Contents.length;
                                    Contents.Size += result2.Size;
                                    Contents.LastModified = (Contents.LastModified<result2.LastModified || Contents.LastModified == null ? result2.LastModified : Contents.LastModified)
                                    Contents.Cost = ( parseFloat(Contents.Cost)+parseFloat(result2.Cost) ).toFixed(10)
                                    Contents.StorageType = result2.StorageClass    
                                }
                                cb(error,"done")
                            }
                
                        )
                    }else{
                        cb(error,null)
                    }
                }
            )
        },
        (error) => {
            if(argv.sizeType){
                Contents.Size = convertSizes('Bytes',Contents.Size,'GB')
            }
            callback(error, Contents)
        }

    )
}

/**
 * Convert sizes
 * @param {String} givenSizeType 
 * @param {Int} size 
 * @param {String} requestedSizeType 
 */
function convertSizes (givenSizeType,size,requestedSizeType) {
    if (size === 0) return 0;
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const givenSizeTypeIndex = sizes.indexOf(givenSizeType);
    const requestedSizeTypeIndex = sizes.indexOf(requestedSizeType);

    if ( requestedSizeTypeIndex > givenSizeTypeIndex) {
        return size / Math.pow(k,(requestedSizeTypeIndex-givenSizeTypeIndex))
    }else{
        return size * Math.pow(k,(givenSizeTypeIndex-requestedSizeTypeIndex))

    }
}


/**
 * Calculate the cost of an object
 * @param {String} type Storage type
 * @param {Int} duration Shows how many months a file exists
 * @param {*} size The size of the file
 * @param {*} level recursive level 
 */
function priceCalculation (type, duration, size, level){
    // Reference: https://aws.amazon.com/s3/reduced-redundancy/
    const k = 1024;
    var TB = convertSizes('Bytes',size,'TB') 
    var GB = convertSizes('Bytes',size,'GB') 
    switch(type){
        case "STANDARD":
            // First 50 TB
            if(level ==0 && TB < 50){
                return 0.023*GB*duration;
            // First 50 TB and calculate for next 450 TB
            }else if (level ==0 && TB >= 50) {
                var temp = 0.023*convertSizes('TB',50,'GB')*duration;
                size = size - convertSizes('TB',50,'Bytes')
                return temp+priceCalculation(type, duration, size, 1);
            // The 450 TB
            }else if (level ==1 && TB < 450) {
                return 0.022*GB*duration;
            // The 450 TB and calculate the over
            }else if(level ==1 && TB >= 450) {
                var temp = 0.022*convertSizes('TB',450,'GB')*duration;
                size = size - convertSizes('TB',450,'Bytes')
                return temp+priceCalculation(type, duration, size, 1);
            // Calculate 500 TB over
            }else{
                return 0.021*GB*duration;
            }
            break;
        case "STANDARD_IA":
            return 0.0125*GB*duration;
            break;
        case "REDUCED_REDUNDANCY":
            // First TB
            if(level ==0 && TB < 1){
                return 0.024*GB*duration;
            // First TB and calculate for next 4999 TB
            }else if (level ==0 && TB >= 1) {
                var temp = 0.024*convertSizes('TB',1,'GB')*duration;
                size = size - convertSizes('TB',1,'Bytes')
                return temp+priceCalculation(type, duration, size, 1);
            // The 4999 TB
            }else if (level ==1 && TB < 4999) {
                return 0.0236*GB*duration;
            // The 4999 TB and calculate the over
            }else if(level ==1 && TB >= 4999) {
                var temp = 0.0236*convertSizes('TB',4999,'GB')*duration;
                size = size - convertSizes('TB',4999,'Bytes')
                return temp+priceCalculation(type, duration, size, 2);
            // Calculate 5000 TB over
            }else{
                return 0.022*GB*duration;
            }
            break;
            break;
        case "GLACIER":
            return 0.0004*GB*duration;
            break;
        case "ONEZONE_IA":
            return 0.01*GB*duration;
            break;
        case "INTELLIGENT_TIERING":
            // First 50 TB
            if(level ==0 && TB < 50){
                return 0.023*GB*duration;
            // First 50 TB and calculate for next 450 TB
            }else if (level ==0 && TB >= 50) {
                var temp = 0.023*convertSizes('TB',50,'GB')*duration;
                size = size - convertSizes('TB',50,'Bytes')
                return temp+priceCalculation(type, duration, size, 1);
            // The 450 TB
            }else if (level ==1 && TB < 450) {
                return 0.022*GB*duration;
            // The 450 TB and calculate the over
            }else if(level ==1 && TB >= 450) {
                var temp = 0.022*convertSizes('TB',450,'GB')*duration;
                size = size - convertSizes('TB',450,'Bytes')
                return temp+priceCalculation(type, duration, size, 1);
            // Calculate 500 TB over
            }else{
                return 0.021*GB*duration;
            }
            break;
        case "DEEP_ARCHIVE":
            return 0.00099*GB*duration;
            break;
    }
}
